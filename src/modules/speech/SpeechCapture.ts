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
 * Cross-browser quirks handled:
 * - Android Chrome: ignores continuous:true, stops after each utterance → restart via onend
 * - Safari/macOS: continuous:true can stall after the first result; onspeechend never fires.
 *   Fix: restart on both onend AND a watchdog timer that detects silence > 6s.
 *
 * Key insight: always create a FRESH SpeechRecognition instance on each restart —
 * reusing the same object causes silent freezes on Android and Safari.
 */
export class SpeechCapture {
  private recognition: SpeechRecognition | null = null;
  private sessionStartMs = 0;
  private events: SpeechCaptureEvents;
  private running = false;
  private SpeechRecognitionCtor: SpeechRecognitionConstructor | null = null;

  // Watchdog: if no onresult/onend fires within this window, force-restart.
  // Safari stalls silently; this detects and recovers from it.
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly WATCHDOG_MS = 6000;

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
    // Set running = false FIRST so watchdog / onend callbacks won't restart
    this.running = false;
    this.clearWatchdog();
    try {
      this.recognition?.stop();
    } catch {
      // InvalidStateError if already stopped — safe to ignore
    }
    this.recognition = null;
  }

  /**
   * Creates a fresh SpeechRecognition instance and starts it.
   * Called on initial start and on every restart.
   */
  private createAndStart(): void {
    if (!this.running || !this.SpeechRecognitionCtor) return;

    const recognition = new this.SpeechRecognitionCtor();
    recognition.lang = 'zh-TW';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // Reset watchdog on any activity
      this.resetWatchdog();

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
      // These are normal — browser stops after silence or on manual stop.
      // onend will handle restart.
      const ignorable = ['no-speech', 'aborted'];
      if (!ignorable.includes(event.error)) {
        this.events.onError(`SpeechRecognition error: ${event.error}`);
      }
    };

    // On every stop: discard this instance, schedule a fresh one.
    // 300ms gap ensures the mic lock is released before re-acquiring.
    recognition.onend = () => {
      this.clearWatchdog();
      this.recognition = null;
      if (this.running) {
        setTimeout(() => {
          if (this.running) this.createAndStart();
        }, 300);
      }
    };

    this.recognition = recognition;

    try {
      recognition.start();
      // Start watchdog after launching — if nothing fires in WATCHDOG_MS,
      // force-restart (catches Safari's silent stall after first utterance)
      this.resetWatchdog();
    } catch {
      this.recognition = null;
      setTimeout(() => {
        if (this.running) this.createAndStart();
      }, 500);
    }
  }

  private resetWatchdog(): void {
    this.clearWatchdog();
    this.watchdogTimer = setTimeout(() => {
      if (!this.running) return;
      // Force stop — onend will trigger createAndStart()
      try {
        this.recognition?.stop();
      } catch {
        // If stop() fails, restart directly
        this.recognition = null;
        this.createAndStart();
      }
    }, SpeechCapture.WATCHDOG_MS);
  }

  private clearWatchdog(): void {
    if (this.watchdogTimer !== null) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
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
