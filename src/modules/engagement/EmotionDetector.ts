import type { EngagementFrame, EmotionTag } from './types';

/**
 * EmotionDetector — thin wrapper that reads emotion data FROM the shared
 * EngagementFrame stream (produced by the vision worker).
 *
 * Emotion inference itself happens inside vision.worker.ts.
 * This class provides convenience accessors and the latest-emotion snapshot
 * needed by TimelineSyncer.
 */
export class EmotionDetector {
  private latestEmotion: EmotionTag = 'neutral';

  /** Call this whenever a new EngagementFrame arrives */
  update(frame: EngagementFrame): void {
    this.latestEmotion = frame.emotion;
  }

  getLatestEmotion(): EmotionTag {
    return this.latestEmotion;
  }

  reset(): void {
    this.latestEmotion = 'neutral';
  }
}
