/**
 * TDD — RED phase
 *
 * Bug: Azure Speech returns "No audio data received" because Vercel's built-in
 * body parser does not handle audio/wav binary content. It intercepts the
 * request stream and leaves req.body as an empty object {}, so the handler
 * forwards zero bytes to Azure.
 *
 * Fix required: The handler must disable Vercel's body parser (via
 * `export const config = { api: { bodyParser: false } }`) and manually
 * collect the raw IncomingMessage stream into a Buffer before forwarding it.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';

// ── Helpers to build mock VercelRequest / VercelResponse ─────────────────────

function makeReq(overrides: {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  /** Raw bytes to stream through the IncomingMessage (bodyParser disabled) */
  rawBytes?: Buffer;
}): IncomingMessage & { body: unknown; query: Record<string, string> } {
  const readable = overrides.rawBytes
    ? Readable.from([overrides.rawBytes])
    : Readable.from([]);

  const req = Object.assign(readable, {
    method: overrides.method ?? 'POST',
    headers: {
      'content-type': 'audio/wav',
      ...overrides.headers,
    },
    body: overrides.body,          // what Vercel's body parser would set
    query: overrides.query ?? {},
  }) as IncomingMessage & { body: unknown; query: Record<string, string> };

  return req;
}

function makeRes() {
  let statusCode = 200;
  let sentJson: unknown;

  const res = {
    status(code: number) { statusCode = code; return res; },
    json(data: unknown) { sentJson = data; return res; },
    getStatus: () => statusCode,
    getJson:   () => sentJson,
  };
  return res;
}

// ── Mock fetch ───────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubEnv('AZURE_SPEECH_KEY', 'test-key');
  vi.stubEnv('AZURE_SPEECH_REGION', 'eastasia');
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/transcribe — body reading', () => {

  it('returns Azure error when req.body is an empty object (bodyParser NOT disabled)', async () => {
    /**
     * RED: This test documents the CURRENT broken behaviour.
     * When Vercel's body parser is active, req.body is {} for audio/wav.
     * The handler reads req.body (an empty object) and forwards it to Azure,
     * which returns "No audio data received".
     *
     * We simulate this by passing body: {} and no rawBytes.
     */
    const { default: handler } = await import('./transcribe.js');

    // Minimal valid WAV header (44 bytes) — what the client actually sends
    const wavHeader = Buffer.alloc(44);
    wavHeader.write('RIFF', 0);
    wavHeader.write('WAVE', 8);

    // Simulate Vercel body parser having consumed the stream and set body = {}
    const req = makeReq({ body: {}, rawBytes: undefined });
    const res = makeRes();

    // Mock fetch to capture what was sent to Azure
    let capturedBody: unknown;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      capturedBody = init.body;
      // Azure returns this error when it receives empty/no audio
      return {
        ok: false,
        status: 400,
        text: async () => '"No audio data received"',
      };
    }));

    await handler(req as any, res as any);

    // With the fix: the empty-body guard catches this before reaching Azure,
    // returning our own clear error message instead of forwarding zero bytes.
    expect(capturedBody).toBeUndefined();  // fetch was never called
    expect(res.getStatus()).toBe(400);
    expect((res.getJson() as any).error).toContain('Empty audio body received');
  });

  it('forwards a real Buffer to Azure when raw stream is read (bodyParser disabled)', async () => {
    /**
     * GREEN target: After the fix, the handler must:
     * 1. Read the raw IncomingMessage stream into a Buffer.
     * 2. Forward that Buffer to Azure.
     * 3. Return the transcription result.
     *
     * This test will FAIL until the fix is applied.
     */
    const { default: handler } = await import('./transcribe.js');

    // Minimal valid WAV: 44-byte header + 2 bytes of silence
    const wavBytes = Buffer.alloc(46);
    wavBytes.write('RIFF', 0, 'ascii');
    wavBytes.writeUInt32LE(38, 4);
    wavBytes.write('WAVE', 8, 'ascii');
    wavBytes.write('fmt ', 12, 'ascii');
    wavBytes.writeUInt32LE(16, 16);
    wavBytes.writeUInt16LE(1, 20);   // PCM
    wavBytes.writeUInt16LE(1, 22);   // mono
    wavBytes.writeUInt32LE(16000, 24); // 16kHz
    wavBytes.writeUInt32LE(32000, 28);
    wavBytes.writeUInt16LE(2, 32);
    wavBytes.writeUInt16LE(16, 34);
    wavBytes.write('data', 36, 'ascii');
    wavBytes.writeUInt32LE(2, 40);
    // 2 bytes of silence already zero

    // Simulate bodyParser DISABLED: req.body is undefined, raw bytes stream through
    const req = makeReq({ body: undefined, rawBytes: wavBytes });
    const res = makeRes();

    let capturedBody: unknown;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      capturedBody = init.body;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          RecognitionStatus: 'Success',
          DisplayText: 'Hello',
          NBest: [{ Display: 'Hello', Words: [] }],
        }),
      };
    }));

    await handler(req as any, res as any);

    // After fix: capturedBody must be a Buffer containing the WAV bytes
    expect(capturedBody).toBeInstanceOf(Buffer);
    expect((capturedBody as Buffer).length).toBe(wavBytes.length);
    expect(res.getStatus()).toBe(200);
    expect((res.getJson() as any).text).toBe('Hello');
  });

});
