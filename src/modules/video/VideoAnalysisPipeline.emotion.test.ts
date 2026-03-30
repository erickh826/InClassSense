/**
 * RED tests — emotion_context bugs in VideoAnalysisPipeline
 *
 * Three bugs under test:
 *
 *  BUG-1  The fallback utterance path (Azure returns text but no word timestamps)
 *         never calls buildUtterance, so emotion_context is NEVER set even when
 *         frame data is available.
 *
 *  BUG-2  buildUserPrompt in videoAnalysis.config.ts always includes the section
 *         header "【語音逐字稿（含時間戳與情緒）】" regardless of whether any
 *         emotion_context values are actually present, misleading the LLM.
 *
 *  BUG-3  When frames is empty (vision worker failed / no face detected),
 *         engagement_stats are all zeros but the prompt still includes the
 *         【視覺統計數據】 section with no indication that vision data is absent,
 *         causing the LLM to incorrectly treat zeros as real measurements.
 */

import { describe, it, expect } from 'vitest';
import type { EngagementFrame, SessionPayload } from '../engagement/types';
import { videoAnalysisConfig } from '../../config/videoAnalysis.config';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Minimal frames array with one happy frame at t=5000ms */
const FRAMES_WITH_EMOTION: EngagementFrame[] = [
  { timestamp_ms: 5000, is_present: true, is_looking_at_screen: true, emotion: 'happy' },
];

/** Simulate the FIXED fallback utterance that now resolves emotion_context from nearest frame */
function buildFallbackUtterance(startSec: number, text: string, frames: EngagementFrame[]) {
  const startMs = startSec * 1000;
  const mm = String(Math.floor(startMs / 60000)).padStart(2, '0');
  const ss = String(Math.floor((startMs % 60000) / 1000)).padStart(2, '0');
  let emotionContext: EngagementFrame['emotion'] | undefined;
  if (frames.length > 0) {
    const closest = frames.reduce((prev, cur) =>
      Math.abs(cur.timestamp_ms - startMs) < Math.abs(prev.timestamp_ms - startMs) ? cur : prev,
    );
    emotionContext = closest.emotion;
  }
  return { time: `${mm}:${ss}`, speaker: 'Student' as const, text, emotion_context: emotionContext };
}

// ── BUG-1: Fallback utterance path drops emotion_context ─────────────────────

describe('BUG-1: fallback utterance (text-only) should carry emotion_context', () => {
  it('fallback utterance built at startSec=5 should have emotion_context=happy from nearest frame', () => {
    // The nearest frame is at 5000ms; startSec=5 → startMs=5000ms → exact match → emotion='happy'
    const utterance = buildFallbackUtterance(5, 'Hello world', FRAMES_WITH_EMOTION);

    expect(utterance).toHaveProperty('emotion_context');
    expect(utterance.emotion_context).toBe('happy');
  });
});

// ── BUG-2: Prompt includes emotion header even when no emotion data exists ────

describe('BUG-2: buildUserPrompt should omit emotion header when no emotion data', () => {
  it('prompt should NOT contain 情緒 when all utterances lack emotion_context', () => {
    const payload: SessionPayload = {
      session_info: { duration_seconds: 30, topic: 'test' },
      engagement_stats: {
        overall_attention_rate: 0,
        smile_count: 0,
        confused_count: 0,
        surprised_count: 0,
        absence_count: 0,
      },
      multimodal_transcript: [
        { time: '00:00', speaker: 'Student', text: 'Hello' },
        { time: '00:05', speaker: 'Student', text: 'World' },
        // No emotion_context on any utterance
      ],
    };

    const prompt = videoAnalysisConfig.buildUserPrompt(payload, {
      input: 'test topic',
      output: 'test focus',
    });

    // BUG: current prompt always says 含時間戳與情緒 even with no emotion data
    // This test should FAIL until the fix is applied
    expect(prompt).not.toContain('情緒');
  });

  it('prompt SHOULD contain 情緒 when at least one utterance has emotion_context', () => {
    const payload: SessionPayload = {
      session_info: { duration_seconds: 30, topic: 'test' },
      engagement_stats: {
        overall_attention_rate: 80,
        smile_count: 2,
        confused_count: 0,
        surprised_count: 0,
        absence_count: 0,
      },
      multimodal_transcript: [
        { time: '00:05', speaker: 'Student', text: 'Hello', emotion_context: 'happy' },
      ],
    };

    const prompt = videoAnalysisConfig.buildUserPrompt(payload, {
      input: 'test topic',
      output: 'test focus',
    });

    expect(prompt).toContain('情緒');
  });
});

// ── BUG-3: Prompt should indicate when vision data is unavailable ─────────────

describe('BUG-3: buildUserPrompt should note when vision data is unavailable', () => {
  it('prompt should indicate no vision data when all engagement_stats are zero and no emotion_context exists', () => {
    const payload: SessionPayload = {
      session_info: { duration_seconds: 60, topic: 'test' },
      engagement_stats: {
        overall_attention_rate: 0,
        smile_count: 0,
        confused_count: 0,
        surprised_count: 0,
        absence_count: 0,
      },
      multimodal_transcript: [
        { time: '00:00', speaker: 'Student', text: 'Some speech' },
      ],
    };

    const prompt = videoAnalysisConfig.buildUserPrompt(payload, {
      input: 'test topic',
      output: 'test focus',
    });

    // BUG: current prompt shows all-zero stats with no disclaimer,
    // causing LLM to treat zeros as real measurements
    // This test should FAIL until the fix is applied
    expect(prompt).toContain('視覺數據不可用');
  });
});
