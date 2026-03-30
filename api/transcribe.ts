import type { VercelRequest, VercelResponse } from '@vercel/node';

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
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const speechKey    = process.env.AZURE_SPEECH_KEY;
  const speechRegion = process.env.AZURE_SPEECH_REGION || 'eastasia';

  if (!speechKey) {
    return res.status(500).json({ error: 'AZURE_SPEECH_KEY not configured' });
  }

  const lang = (req.query.lang as string) || 'zh-TW';

  // Determine content type — forward what the client sent, default to webm
  const contentType = (req.headers['content-type'] as string) || 'audio/webm;codecs=opus';

  const endpoint =
    `https://${speechRegion}.stt.speech.microsoft.com` +
    `/speech/recognition/conversation/cognitiveservices/v1` +
    `?language=${lang}&format=detailed&profanity=raw`;

  try {
    // req.body is a Buffer when Vercel receives binary content-type
    const audioBuffer: Buffer = req.body;

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
