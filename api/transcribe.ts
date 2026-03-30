import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { IncomingMessage } from 'node:http';

/**
 * Vercel serverless function — proxies audio to Azure AI Speech REST API.
 *
 * Environment variables (set in Vercel project settings, NO VITE_ prefix):
 *   AZURE_SPEECH_KEY     Azure AI Speech subscription key
 *   AZURE_SPEECH_REGION  e.g. eastasia
 *
 * Request:
 *   POST /api/transcribe
 *   Content-Type: audio/webm (or audio/wav)
 *   Body: raw audio binary
 *   Query:  ?lang=zh-TW  (optional, default zh-TW)
 *
 * Response:
 *   { text: string, words?: Array<{ word: string, offset_ms: number, duration_ms: number }> }
 *
 * IMPORTANT: bodyParser must be disabled so Vercel does not intercept the
 * binary stream. Without this, req.body is an empty object {} for audio/wav
 * content-type, causing Azure to return "No audio data received".
 */

// Disable Vercel's built-in body parser — we read the raw stream ourselves.
// NOTE: disabling bodyParser also disables Vercel's built-in 4.5 MB body size
// guard, so we enforce our own cap in readRawBody() below.
export const config = {
  api: { bodyParser: false },
};

// [SECURITY] Body size cap — matches Vercel's default guard.
// Our 30s WAV chunks are ~0.92 MB, so 5 MB gives ample headroom while
// preventing unbounded memory allocation from oversized requests.
const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 MB

// [SECURITY] Language code allowlist — prevents query-parameter injection.
// Accepts BCP-47 tags: zh-TW, en-US, ja-JP, zh-CN, en-GB, etc.
const ALLOWED_LANG_RE = /^[a-zA-Z]{2,3}(-[a-zA-Z]{2,4})?$/;

/**
 * Collect all chunks from a Node.js IncomingMessage stream into a single Buffer.
 * Rejects immediately if the incoming body exceeds maxBytes.
 */
function readRawBody(req: IncomingMessage, maxBytes = MAX_BODY_BYTES): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let received = 0;
    req.on('data', (chunk: Buffer) => {
      received += chunk.length;
      if (received > maxBytes) {
        req.destroy();
        return reject(new Error(`Request body exceeds ${maxBytes} bytes`));
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const speechKey    = process.env.AZURE_SPEECH_KEY;
  const speechRegion = process.env.AZURE_SPEECH_REGION || 'eastasia';

  if (!speechKey) {
    return res.status(500).json({ error: 'AZURE_SPEECH_KEY not configured' });
  }

  // [SECURITY] Validate lang against a strict BCP-47 allowlist before
  // interpolating into the upstream URL.  Rejects values like
  // "zh-TW&format=simple" that would inject extra query parameters.
  const rawLang = (req.query.lang as string) || 'zh-TW';
  if (!ALLOWED_LANG_RE.test(rawLang)) {
    return res.status(400).json({ error: 'Invalid language code' });
  }
  const lang = rawLang;

  // Forward the original Content-Type header; default to audio/wav
  const contentType = (req.headers['content-type'] as string) || 'audio/wav';

  const endpoint =
    `https://${speechRegion}.stt.speech.microsoft.com` +
    `/speech/recognition/conversation/cognitiveservices/v1` +
    `?language=${encodeURIComponent(lang)}&format=detailed&profanity=raw`;

  try {
    // Read the raw binary body from the stream (bodyParser is disabled above)
    const audioBuffer = await readRawBody(req);

    if (audioBuffer.length === 0) {
      return res.status(400).json({ error: 'Empty audio body received' });
    }

    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': speechKey,
        'Content-Type': contentType,
        'Accept': 'application/json',
      },
      body: audioBuffer,
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      return res.status(upstream.status).json({ error: `Azure Speech error: ${errText}` });
    }

    const data = await upstream.json();

    // Azure detailed format nests results — flatten for the client
    const recognized = data.NBest?.[0];
    const text: string = recognized?.Display ?? data.DisplayText ?? '';

    // Word-level timestamps are in recognized?.Words
    const words = (recognized?.Words ?? []).map((w: {
      Word: string;
      Offset: number;   // 100-ns ticks
      Duration: number; // 100-ns ticks
    }) => ({
      word:        w.Word,
      offset_ms:   Math.round(w.Offset   / 10000),
      duration_ms: Math.round(w.Duration / 10000),
    }));

    return res.status(200).json({ text, words });
  } catch (err) {
    return res.status(502).json({ error: `Transcription request failed: ${err}` });
  }
}
