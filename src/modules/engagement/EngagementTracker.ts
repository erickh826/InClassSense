import type {
  EngagementFrame,
  SessionEngagementStats,
  SessionPayload,
  Utterance,
} from './types';
import { HeadPoseAnalyzer } from './HeadPoseAnalyzer';
import { EmotionDetector } from './EmotionDetector';
import { syncTranscript } from './TimelineSyncer';
import { SpeechCapture } from '../speech/SpeechCapture';
import { TranscriptBuilder } from '../speech/TranscriptBuilder';

export interface EngagementTrackerEvents {
  onUtterance?: (utterance: Utterance) => void;
  onInterim?: (text: string) => void;
  onFrame?: (frame: EngagementFrame) => void;
  onError?: (error: string) => void;
  /** 'user' = front/selfie camera (default), 'environment' = back camera */
  facingMode?: 'user' | 'environment';
}

/**
 * EngagementTracker — top-level orchestrator.
 *
 * start()  → requests camera + mic, spins up vision worker + speech
 * stop()   → tears everything down, computes stats, returns SessionPayload
 */
export class EngagementTracker {
  private headPose = new HeadPoseAnalyzer();
  private emotionDetector = new EmotionDetector();
  private transcript = new TranscriptBuilder();
  private speech: SpeechCapture;
  private stream: MediaStream | null = null;
  private sessionStartMs = 0;
  private events: EngagementTrackerEvents;

  constructor(events: EngagementTrackerEvents = {}) {
    this.events = events;

    this.speech = new SpeechCapture({
      onUtterance: (u) => {
        this.transcript.pushStudentUtterance(u);
        this.events.onUtterance?.(u);
      },
      onInterim: (text) => {
        this.events.onInterim?.(text);
      },
      onError: (err) => {
        this.events.onError?.(err);
      },
    });
  }

  async start(videoElement: HTMLVideoElement): Promise<void> {
    // 1) Camera permission
    // Try requested facingMode first; fall back to any camera if not found.
    const facingMode = this.events.facingMode ?? 'user';
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
    } catch {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
    }
    // On Android, setting srcObject triggers an internal load. We must wait for
    // the 'canplay' event before calling play(), otherwise we get:
    // "AbortError: The play() request was interrupted by a new load request"
    videoElement.srcObject = this.stream;
    await new Promise<void>((resolve) => {
      const onCanPlay = () => {
        videoElement.removeEventListener('canplay', onCanPlay);
        resolve();
      };
      videoElement.addEventListener('canplay', onCanPlay);
      // If already ready, resolve immediately
      if (videoElement.readyState >= videoElement.HAVE_ENOUGH_DATA) {
        videoElement.removeEventListener('canplay', onCanPlay);
        resolve();
      }
    });
    await videoElement.play();

    // 2) Init vision worker (loads MediaPipe + face-api models)
    await this.headPose.init();

    // 3) Start frame loop
    this.headPose.startProcessing(videoElement, (frame) => {
      this.emotionDetector.update(frame);
      this.events.onFrame?.(frame);
    });

    // 4) Start speech
    this.transcript.start();
    this.speech.start();

    this.sessionStartMs = Date.now();
  }

  /** Push an AI utterance into the transcript */
  addAIUtterance(text: string): void {
    this.transcript.pushAIUtterance(text);
  }

  /** Stop everything, compute stats, return final payload */
  stop(topic: string): SessionPayload {
    // Stop speech
    this.speech.stop();

    // Stop vision
    this.headPose.stopProcessing();
    const frames = this.headPose.getFrames();

    // Stop camera tracks (privacy requirement)
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;

    // Compute duration
    const durationSeconds = Math.round((Date.now() - this.sessionStartMs) / 1000);

    // Sync emotions onto transcript
    const rawTranscript = this.transcript.getTranscript();
    const syncedTranscript = syncTranscript(rawTranscript, frames);

    // Compute engagement stats
    const stats = this.computeStats(frames);

    // Privacy: clear raw frame data
    this.headPose.clearFrames();
    this.emotionDetector.reset();

    // Shutdown worker
    this.headPose.shutdown();

    return {
      session_info: {
        duration_seconds: durationSeconds,
        topic,
      },
      engagement_stats: stats,
      multimodal_transcript: syncedTranscript,
    };
  }

  private computeStats(frames: EngagementFrame[]): SessionEngagementStats {
    if (frames.length === 0) {
      return {
        overall_attention_rate: 0,
        smile_count: 0,
        confused_count: 0,
        surprised_count: 0,
        absence_count: 0,
      };
    }

    // Attention rate
    const attentiveFrames = frames.filter(
      (f) => f.is_present && f.is_looking_at_screen,
    ).length;
    const overall_attention_rate = Math.round(
      (attentiveFrames / frames.length) * 100,
    );

    // Count contiguous segments of each emotion/state (debounce via segments)
    const smile_count = this.countSegments(frames, (f) => f.emotion === 'happy');
    const confused_count = this.countSegments(frames, (f) => f.emotion === 'confused');
    const surprised_count = this.countSegments(frames, (f) => f.emotion === 'surprised');
    const absence_count = this.countSegments(frames, (f) => !f.is_present);

    return {
      overall_attention_rate,
      smile_count,
      confused_count,
      surprised_count,
      absence_count,
    };
  }

  /**
   * Counts the number of contiguous segments where the predicate is true.
   * e.g. [true, true, false, true] → 2 segments
   */
  private countSegments(
    frames: EngagementFrame[],
    predicate: (f: EngagementFrame) => boolean,
  ): number {
    let count = 0;
    let inSegment = false;
    for (const frame of frames) {
      if (predicate(frame)) {
        if (!inSegment) {
          count++;
          inSegment = true;
        }
      } else {
        inSegment = false;
      }
    }
    return count;
  }
}
