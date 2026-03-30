// ── GeminiAnalyser ─────────────────────────────────────────────────────────
// Client-side orchestrator for YouTube → Gemini 2.0 Flash analysis.
// Posts to /api/analyse (Vercel serverless function) and returns a markdown
// report string.  Video data NEVER enters the browser — Gemini fetches the
// YouTube URL directly on the server side.
// ───────────────────────────────────────────────────────────────────────────

export interface GeminiAnalyserOptions {
  youtubeUrl: string;
  inputContext: string;
  outputFocus: string;
}

export interface GeminiAnalyserResult {
  report: string;
}

export async function runGeminiAnalysis(
  opts: GeminiAnalyserOptions,
): Promise<GeminiAnalyserResult> {
  const { youtubeUrl, inputContext, outputFocus } = opts;

  const res = await fetch('/api/analyse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ youtubeUrl, inputContext, outputFocus }),
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch { /* ignore */ }
    throw new Error(message);
  }

  const data = (await res.json()) as { report?: string };
  if (!data.report) throw new Error('No report returned from server');

  return { report: data.report };
}
