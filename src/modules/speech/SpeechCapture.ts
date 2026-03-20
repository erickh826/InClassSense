import type { Utterance } from '../engagement/types';

export type SpeechCaptureEvents = {
  onUtterance: (utterance: Utterance) => void;
  onInterim: (text: string) => void;
  onError: (error: string) => void;
};

/**
 * Wraps the Web Speech API (SpeechRecognition).
 * Emits finalised Utterance objects with MM:SS timestamps relative to session start.
 */
export class SpeechCapture {
  private recognition: SpeechRecognition | null = null;
  private sessionStartMs = 0;
  private events: SpeechCaptureEvents;
  private running = false;

  constructor(events: SpeechCaptureEvents) {
    this.events = events;
  }

  /** Returns false if the browser doesn't support SpeechRecognition */
  start(): boolean {
    const SpeechRecognition =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      this.events.onError('SpeechRecognition API not supported in this browser');
      return false;
    }

    this.sessionStartMs = Date.now();
    const recognition = new SpeechRecognition();
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
      // 'no-speech' and 'aborted' are normal — browser stops after silence or
      // when we manually stop; the onend handler will restart if still running.
      const ignorable = ['no-speech', 'aborted'];
      if (!ignorable.includes(event.error)) {
        this.events.onError(`SpeechRecognition error: ${event.error}`);
      }
    };

    // Auto-restart on end.
    // Android Chrome stops recognition after ~5s of silence or after each utterance.
    // We restart with a small delay to avoid a tight restart loop that causes
    // "aborted" errors when stop() races with the auto-restart.
    recognition.onend = () => {
      if (this.running) {
        setTimeout(() => {
          if (this.running) {
            try {
              recognition.start();
            } catch {
              // InvalidStateError: recognition already started — safe to ignore
            }
          }
        }, 150);
      }
    };

    this.recognition = recognition;
    this.running = true;
    recognition.start();
    return true;
  }

  stop(): void {
    // Set running = false FIRST so the onend setTimeout won't restart
    this.running = false;
    try {
      this.recognition?.stop();
    } catch {
      // InvalidStateError if recognition already stopped — safe to ignore
    }
    this.recognition = null;
  }

  /** Returns elapsed time as "MM:SS" */
  private elapsedTime(): string {
    const elapsed = Math.floor((Date.now() - this.sessionStartMs) / 1000);
    const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const ss = String(elapsed % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }
}
