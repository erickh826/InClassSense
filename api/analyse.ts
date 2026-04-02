import type { VercelRequest, VercelResponse } from '@vercel/node';

// ── Body parser must be disabled — we read raw JSON ourselves ──────────────
export const config = { api: { bodyParser: false } };

// ── Security: allowed YouTube URL pattern ─────────────────────────────────
// Accepts full watch URLs and short youtu.be URLs, with any trailing params
const YOUTUBE_RE =
  /^https:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]{11}([&?][\w=&%.,-]*)?$/i;

// Extract the bare video ID and return a canonical clean URL (strips &t=, &ab_channel= etc.)
// Gemini 400s on URLs with extra params like &t=1s
function normaliseYoutubeUrl(url: string): string {
  try {
    const u = new URL(url);
    const isShort = u.hostname === 'youtu.be';
    const videoId = isShort
      ? u.pathname.slice(1).replace(/[^\w-]/g, '')
      : (u.searchParams.get('v') ?? '');
    if (!videoId) return url; // fallback: send as-is
    return `https://www.youtube.com/watch?v=${videoId}`;
  } catch {
    return url;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function readJsonBody(req: VercelRequest): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => { raw += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(raw)); }
      catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function buildPrompt(inputContext: string, outputFocus: string): string {
  return `你是一位專業的課堂/面試分析師。請根據以下指示分析這段影片並以繁體中文 Markdown 格式輸出詳細報告。

## 影片背景
${inputContext || '（未提供背景說明）'}

## 分析重點
${outputFocus || '（未提供輸出要求）'}

## 報告格式要求
- 使用 Markdown 標題（##、###）組織報告
- 每個分析重點獨立成節
- 提供具體可執行的改善建議
- 如有時間軸觀察，請標注時間戳
- 結尾提供總結評分（1–10 分）及整體建議`;
}

// ── Handler ────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  let body: { youtubeUrl?: string; inputContext?: string; outputFocus?: string };
  try {
    body = (await readJsonBody(req)) as typeof body;
  } catch {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const { youtubeUrl, inputContext = '', outputFocus = '' } = body;

  if (!youtubeUrl) return res.status(400).json({ error: 'youtubeUrl is required' });
  if (!YOUTUBE_RE.test(youtubeUrl)) {
    return res.status(400).json({ error: 'Invalid YouTube URL format' });
  }

  // Strip timestamp/extra params — Gemini 400s on URLs like ?v=xxx&t=1s
  const cleanUrl = normaliseYoutubeUrl(youtubeUrl);
  console.log(`[analyse] normalised URL: ${youtubeUrl} → ${cleanUrl}`);

  const prompt = buildPrompt(inputContext, outputFocus);

  const geminiPayload = {
    contents: [
      {
        parts: [
          // mimeType must be 'video/*' (NOT 'video/mp4') for YouTube URLs
          // Empty string also works per Google docs; 'video/*' is most explicit
          { fileData: { mimeType: 'video/*', fileUri: cleanUrl } },
          { text: prompt },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 4096,
    },
  };

  // Gemini intermittently returns transient 400s for YouTube URLs (known issue).
  // Retry up to MAX_RETRIES times with exponential backoff before giving up.
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = [1000, 2500, 5000];

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  let lastErr = '';
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      console.log(`[analyse] retry attempt ${attempt} after ${RETRY_DELAY_MS[attempt - 1]}ms`);
      await sleep(RETRY_DELAY_MS[attempt - 1]);
    }

    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(geminiPayload),
        },
      );

      if (!geminiRes.ok) {
        const errText = await geminiRes.text();
        console.error(`[analyse] Gemini ${geminiRes.status} (attempt ${attempt + 1}):`, errText);
        lastErr = errText;
        // Only retry on 400 (known transient YouTube issue) and 503
        if (geminiRes.status !== 400 && geminiRes.status !== 503) {
          return res.status(502).json({ error: `Gemini API error: ${geminiRes.status}`, detail: errText });
        }
        continue; // retry
      }

      const data = await geminiRes.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };

      const text =
        data.candidates?.[0]?.content?.parts
          ?.map((p) => p.text ?? '')
          .join('') ?? '';

      if (!text) {
        return res.status(502).json({ error: 'Empty response from Gemini' });
      }

      return res.status(200).json({ report: text });

    } catch (err) {
      console.error(`[analyse] fetch error (attempt ${attempt + 1}):`, err);
      lastErr = String(err);
      // Network errors are always retryable
    }
  }

  // All retries exhausted
  console.error('[analyse] all retries exhausted. Last error:', lastErr);
  return res.status(502).json({ error: 'Gemini API failed after retries', detail: lastErr });
}
