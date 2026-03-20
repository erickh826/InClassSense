// ─── Emotion ───────────────────────────────────────────────
export type EmotionTag = 'happy' | 'confused' | 'surprised' | 'neutral' | 'absent';

// ─── Per-frame vision result ──────────────────────────────
export interface EngagementFrame {
  timestamp_ms: number;
  is_present: boolean;
  is_looking_at_screen: boolean;
  emotion: EmotionTag;
}

// ─── Transcript ───────────────────────────────────────────
export interface Utterance {
  /** Relative time in "MM:SS" format */
  time: string;
  speaker: 'AI' | 'Student';
  text: string;
  /** Injected by TimelineSyncer after speech completes */
  emotion_context?: EmotionTag;
}

// ─── Aggregated stats for the whole session ───────────────
export interface SessionEngagementStats {
  /** 0–100 (%) */
  overall_attention_rate: number;
  smile_count: number;
  confused_count: number;
  surprised_count: number;
  absence_count: number;
}

// ─── Final payload sent to LLM ───────────────────────────
export interface SessionPayload {
  session_info: {
    duration_seconds: number;
    topic: string;
  };
  engagement_stats: SessionEngagementStats;
  multimodal_transcript: Utterance[];
}

// ─── Worker message protocol ─────────────────────────────
export interface VisionWorkerRequest {
  type: 'init' | 'process_frame' | 'shutdown';
  /** ImageBitmap transferred to worker — only for process_frame */
  frame?: ImageBitmap;
  timestamp_ms?: number;
}

export interface VisionWorkerResponse {
  type: 'ready' | 'frame_result' | 'error';
  frame?: EngagementFrame;
  error?: string;
}
