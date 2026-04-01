import type { VercelRequest, VercelResponse } from '@vercel/node';

// ── Body parser must be disabled — we read raw JSON ourselves ──────────────
export const config = { api: { bodyParser: false } };

// ── Security: allowed YouTube URL pattern ─────────────────────────────────
const YOUTUBE_RE =
  /^https:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]{11}([&?][\w=&%-]*)?$/i;

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

  const prompt = buildPrompt(inputContext, outputFocus);

  const geminiPayload = {
    contents: [
      {
        parts: [
          { fileData: { mimeType: 'video/mp4', fileUri: youtubeUrl } },
          { text: prompt },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 4096,
    },
  };

  try {
    const model = process.env.GEMINI_API_MODEL || 'gemini-2.5-pro';
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiPayload),
      },
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini API error:', geminiRes.status, errText);
      return res.status(502).json({ error: `Gemini API error: ${geminiRes.status}`, detail: errText });
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
    console.error('analyse handler error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
