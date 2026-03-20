import type { Utterance } from '../engagement/types';

export type SpeechCaptureEvents = {
  onUtterance: (utterance: Utterance) => void;
  onInterim: (text: string) => void;
  onError: (error: string) => void;
};

/**
 * Wraps the Web Speech API (SpeechRecognition).
 * Emits finalised Utterance objects with MM:SS timestamps relative to session start.
 *
 * Android Chrome behaviour:
 * - Ignores continuous: true — stops after each utterance or ~5s silence
 * - Silently freezes if you call .start() on the same instance too many times
 *
 * Fix: create a brand-new SpeechRecognition instance on every restart cycle.
 */
export class SpeechCapture {
  private recognition: SpeechRecognition | null = null;
  private sessionStartMs = 0;
  private events: SpeechCaptureEvents;
  private running = false;
  private SpeechRecognitionCtor: SpeechRecognitionConstructor | null = null;

  constructor(events: SpeechCaptureEvents) {
    this.events = events;
  }

  /** Returns false if the browser doesn't support SpeechRecognition */
  start(): boolean {
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) {
      this.events.onError('SpeechRecognition API not supported in this browser');
      return false;
    }

    this.SpeechRecognitionCtor = Ctor;
    this.sessionStartMs = Date.now();
    this.running = true;
    this.createAndStart();
    return true;
  }

  stop(): void {
    // Set running = false FIRST so the onend callback won't restart
    this.running = false;
    try {
      this.recognition?.stop();
    } catch {
      // InvalidStateError if already stopped — safe to ignore
    }
    this.recognition = null;
  }

  /**
   * Creates a fresh SpeechRecognition instance and starts it.
   * Called on initial start and on every restart after onend fires.
   * A fresh instance avoids Android Chrome silently freezing on
   * repeated .start() calls to the same object.
   */
  private createAndStart(): void {
    if (!this.running || !this.SpeechRecognitionCtor) return;

    const recognition = new this.SpeechRecognitionCtor();
    recognition.lang = 'zh-TW';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result?.[0]) continue;

        const text = result[0].transcript.trim();
        if (!text) continue;

        if (result.isFinal) {
          this.events.onUtterance({
            time: this.elapsedTime(),
            speaker: 'Student',
            text,
          });
        } else {
          this.events.onInterim(text);
        }
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // 'no-speech' and 'aborted' are normal — Android fires these constantly.
      // The onend handler below will restart with a fresh instance.
      const ignorable = ['no-speech', 'aborted'];
      if (!ignorable.includes(event.error)) {
        this.events.onError(`SpeechRecognition error: ${event.error}`);
      }
    };

    // On every stop/end: discard this instance, create a fresh one after a
    // short delay. The 300ms gap prevents a tight restart loop on Android
    // and ensures the previous mic lock is released before re-acquiring.
    recognition.onend = () => {
      this.recognition = null;
      if (this.running) {
        setTimeout(() => {
          if (this.running) {
            this.createAndStart();
          }
        }, 300);
      }
    };

    this.recognition = recognition;

    try {
      recognition.start();
    } catch {
      // Unexpected start error — retry after a delay
      this.recognition = null;
      setTimeout(() => {
        if (this.running) this.createAndStart();
      }, 500);
    }
  }

  /** Returns elapsed time as "MM:SS" */
  private elapsedTime(): string {
    const elapsed = Math.floor((Date.now() - this.sessionStartMs) / 1000);
    const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const ss = String(elapsed % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }
}
