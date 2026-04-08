import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

// ── Body parser must be disabled — we read raw JSON ourselves ──────────────
export const config = { api: { bodyParser: false } };

// ── Security: allowed YouTube URL pattern ─────────────────────────────────
// Supports: www/m.youtube.com/watch, youtu.be, youtube.com/shorts
// Server-side trim is applied before this check to handle Windows paste trailing whitespace/CRLF
const YOUTUBE_RE =
  /^https:\/\/(www\.|m\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)[\w-]{11}([&?][\w=&%.,:-]*)?$/i;

// ── URL normalisation ──────────────────────────────────────────────────────
// Extract the bare video ID and return a canonical clean URL.
// Strips &t=, &ab_channel=, &list= and all other extra params that cause
// Gemini to return INVALID_ARGUMENT (400).
function normaliseYoutubeUrl(url: string): string {
  try {
    const u = new URL(url);
    const isShort = u.hostname === 'youtu.be';
    const isShorts = u.pathname.startsWith('/shorts/');
    let videoId: string;
    if (isShort) {
      videoId = u.pathname.slice(1).replace(/[^\w-]/g, '');
    } else if (isShorts) {
      videoId = u.pathname.replace('/shorts/', '').replace(/[^\w-]/g, '');
    } else {
      videoId = u.searchParams.get('v') ?? '';
    }
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
      try {
        // Strip UTF-8 BOM (\uFEFF) that Windows browsers may prepend,
        // and trim surrounding whitespace/CRLF before parsing.
        const cleaned = raw.replace(/^\uFEFF/, '').trim();
        resolve(JSON.parse(cleaned));
      }
      catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function buildPrompt(inputContext: string, outputFocus: string): string {
  return `你是一位專業的面試／課堂評估分析師。請嚴格按照以下規則分析這段影片，並以繁體中文 Markdown 格式輸出報告。

## 影片背景
${inputContext || '（未提供背景說明）'}

## 分析重點（只須針對以下重點作出評估，不得超出範圍）
${outputFocus || '（未提供輸出要求）'}

## 重要限制規則（必須嚴格遵守）
1. **只分析與「影片背景」及「分析重點」直接相關的內容**，其餘片段（如片頭片尾、旁白 VO、背景音樂說明、非受訪者的說話）一律忽略，不作評論。
2. **不得逐字引用**影片中的說話內容。如需舉例說明，須將原話改寫為清晰的書面繁體中文，保留意思即可。
3. 若影片某段說話因語速過快、口音或雜音而不清晰，請以「（此段說話不清晰，略）」標注，不得猜測或捏造內容。
4. 報告語言必須全程使用**繁體中文書面語**，不得出現中英夾雜、粗俗用語或不當字眼。
5. 評估必須客觀、具建設性，避免主觀批評。

## 報告格式要求
- 使用 Markdown 標題（##、###）組織報告
- 每個分析重點獨立成節
- 提供具體可執行的改善建議
- 如有時間軸觀察，請標注時間戳（格式：MM:SS）
- 結尾提供整體總結及下一步改善方向，不需要任何分數`;
}

// ── Retry helper ───────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

  const { youtubeUrl: rawUrl, inputContext = '', outputFocus = '' } = body;
  // Trim server-side to handle Windows browsers that may paste URLs with
  // trailing whitespace, newlines (\n), or carriage returns (\r\n).
  const youtubeUrl = (rawUrl ?? '').trim();

  if (!youtubeUrl) return res.status(400).json({ error: 'youtubeUrl is required' });
  if (!YOUTUBE_RE.test(youtubeUrl)) {
    return res.status(400).json({ error: 'Invalid YouTube URL format' });
  }

  // Strip timestamp/extra params — Gemini 400s on URLs like ?v=xxx&t=1s
  const cleanUrl = normaliseYoutubeUrl(youtubeUrl);
  console.log(`[analyse] normalised URL: ${youtubeUrl} → ${cleanUrl}`);

  const prompt = buildPrompt(inputContext, outputFocus);
  const modelName = process.env.GEMINI_API_MODEL || 'gemini-2.5-pro';

  // ── Use official @google/genai SDK (GA since May 2025) ─────────────────
  // Gemini intermittently returns transient 400s for YouTube URLs (known issue).
  // Retry up to MAX_RETRIES times with exponential backoff before giving up.
  const MAX_RETRIES = 3;
  const RETRY_DELAYS_MS = [1000, 2500, 5000];
  let lastErr = '';

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      console.log(`[analyse] retry attempt ${attempt} after ${RETRY_DELAYS_MS[attempt - 1]}ms`);
      await sleep(RETRY_DELAYS_MS[attempt - 1]);
    }
    try {
      const ai = new GoogleGenAI({ apiKey });

      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          {
            parts: [
              // mimeType must be 'video/*' (NOT 'video/mp4') for YouTube URLs.
              // Using 'video/mp4' causes INVALID_ARGUMENT on YouTube streams.
              { fileData: { mimeType: 'video/*', fileUri: cleanUrl } },
              { text: prompt },
            ],
          },
        ],
        config: {
          temperature: 0.4,
          maxOutputTokens: 4096,
        },
      });

      const text = response.text ?? '';

      if (!text) {
        return res.status(502).json({ error: 'Empty response from Gemini' });
      }

      return res.status(200).json({ report: text });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[analyse] SDK error (attempt ${attempt + 1}):`, message);
      lastErr = message;

      // Only retry on errors that are likely transient (400/503 from Gemini)
      const isTransient = message.includes('400') || message.includes('503') || message.includes('INVALID_ARGUMENT');
      if (!isTransient) {
        return res.status(502).json({ error: `Gemini SDK error: ${message}` });
      }
      // Otherwise fall through to retry
    }
  }

  // All retries exhausted
  console.error('[analyse] all retries exhausted. Last error:', lastErr);
  return res.status(502).json({ error: 'Gemini API failed after retries', detail: lastErr });
}
