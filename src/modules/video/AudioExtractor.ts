/**
 * AudioExtractor
 *
 * Extracts audio from a video File into fixed-size PCM/WebM chunks suitable
 * for the Azure Speech real-time REST API (max ~15s per request to stay under
 * the 60-second conversation segment limit).
 *
 * Strategy:
 *   1. Decode the file with the Web Audio API (OfflineAudioContext).
 *   2. Down-mix to mono 16 kHz — optimal for Azure Speech.
 *   3. Slice into CHUNK_DURATION_S second WAV blobs.
 *   4. Return the array of Blobs with their start-offset in the original video.
 */

const CHUNK_DURATION_S = 15; // seconds per Azure REST segment

export interface AudioChunk {
  blob: Blob;
  /** Start time in the original video (seconds) */
  startSec: number;
  /** Duration of this chunk (seconds) */
  durationSec: number;
}

export async function extractAudioChunks(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<AudioChunk[]> {
  // 1. Read file → ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();
  onProgress?.(5);

  // 2. Decode with AudioContext
  const audioCtx = new AudioContext();
  const decoded = await audioCtx.decodeAudioData(arrayBuffer);
  await audioCtx.close();
  onProgress?.(20);

  // 3. Resample to mono 16 kHz via OfflineAudioContext
  const targetSampleRate = 16000;
  const totalSamples = Math.ceil(decoded.duration * targetSampleRate);
  const offline = new OfflineAudioContext(1, totalSamples, targetSampleRate);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start(0);
  const resampled = await offline.startRendering();
  onProgress?.(40);

  // 4. Slice into chunks and encode each as WAV
  const pcmData = resampled.getChannelData(0); // Float32Array
  const samplesPerChunk = CHUNK_DURATION_S * targetSampleRate;
  const chunks: AudioChunk[] = [];
  let offset = 0;

  while (offset < pcmData.length) {
    const slice = pcmData.slice(offset, offset + samplesPerChunk);
    const startSec = offset / targetSampleRate;
    const durationSec = slice.length / targetSampleRate;
    const wavBlob = encodeWav(slice, targetSampleRate);
    chunks.push({ blob: wavBlob, startSec, durationSec });
    offset += samplesPerChunk;
  }

  onProgress?.(60);
  return chunks;
}

// ── WAV encoder ──────────────────────────────────────────────────────────────

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const numSamples = samples.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0,  'RIFF');
  view.setUint32(4,  36 + numSamples * 2, true);
  writeString(view, 8,  'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16,         true);  // PCM chunk size
  view.setUint16(20, 1,          true);  // PCM format
  view.setUint16(22, 1,          true);  // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2,          true);  // block align
  view.setUint16(34, 16,         true);  // bits per sample
  writeString(view, 36, 'data');
  view.setUint32(40, numSamples * 2, true);

  // PCM samples — clamp Float32 → Int16
  let writeOffset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(writeOffset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    writeOffset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
