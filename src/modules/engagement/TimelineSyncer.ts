import type { Utterance, EngagementFrame } from './types';

/**
 * Converts "MM:SS" → milliseconds for frame matching.
 */
function parseTimeToMs(time: string): number {
  const [mm, ss] = time.split(':').map(Number);
  return ((mm ?? 0) * 60 + (ss ?? 0)) * 1000;
}

/**
 * Attaches the closest emotion snapshot to a student utterance.
 * Called incrementally as each student utterance finalises.
 */
export function attachEmotion(
  utterance: Utterance,
  frames: EngagementFrame[],
): Utterance {
  if (frames.length === 0) return utterance;

  const utteranceMs = parseTimeToMs(utterance.time);
  const closest = frames.reduce((prev, curr) =>
    Math.abs(curr.timestamp_ms - utteranceMs) < Math.abs(prev.timestamp_ms - utteranceMs)
      ? curr
      : prev,
  );
  return { ...utterance, emotion_context: closest.emotion };
}

/**
 * Batch-sync: attaches emotion to all student utterances in the transcript.
 */
export function syncTranscript(
  transcript: Utterance[],
  frames: EngagementFrame[],
): Utterance[] {
  return transcript.map((u) =>
    u.speaker === 'Student' ? attachEmotion(u, frames) : u,
  );
}
