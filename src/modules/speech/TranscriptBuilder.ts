import type { Utterance } from '../engagement/types';

/**
 * Accumulates utterances into a time-ordered transcript.
 * AI utterances are pushed explicitly by the app; Student utterances come from SpeechCapture.
 */
export class TranscriptBuilder {
  private utterances: Utterance[] = [];
  private sessionStartMs = 0;

  start(): void {
    this.sessionStartMs = Date.now();
    this.utterances = [];
  }

  /** Push a student utterance (typically called by SpeechCapture callback) */
  pushStudentUtterance(utterance: Utterance): void {
    this.utterances.push(utterance);
  }

  /** Push an AI utterance with auto-generated timestamp */
  pushAIUtterance(text: string): void {
    this.utterances.push({
      time: this.elapsedTime(),
      speaker: 'AI',
      text,
    });
  }

  getTranscript(): Utterance[] {
    return [...this.utterances];
  }

  /** Replaces transcript entries in-place (used by TimelineSyncer) */
  replaceTranscript(updated: Utterance[]): void {
    this.utterances = updated;
  }

  private elapsedTime(): string {
    const elapsed = Math.floor((Date.now() - this.sessionStartMs) / 1000);
    const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const ss = String(elapsed % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }
}
