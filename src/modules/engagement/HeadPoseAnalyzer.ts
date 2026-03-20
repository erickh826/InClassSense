import type {
  EngagementFrame,
  VisionWorkerRequest,
  VisionWorkerResponse,
} from './types';

/**
 * HeadPoseAnalyzer — owns the Web Worker and the camera→worker frame loop.
 *
 * Lifecycle:  init() → startProcessing(video) → stopProcessing()
 * Frames are sent to the vision worker at ~5 fps.
 */
export class HeadPoseAnalyzer {
  private worker: Worker | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private frames: EngagementFrame[] = [];
  private onFrame?: (frame: EngagementFrame) => void;
  private ready = false;

  /** Spin up the Web Worker and load models */
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.worker = new Worker(
        new URL('../../workers/vision.worker.ts', import.meta.url),
        { type: 'module' },
      );

      this.worker.onmessage = (e: MessageEvent<VisionWorkerResponse>) => {
        const msg = e.data;
        switch (msg.type) {
          case 'ready':
            this.ready = true;
            resolve();
            break;
          case 'frame_result':
            if (msg.frame) {
              this.frames.push(msg.frame);
              this.onFrame?.(msg.frame);
            }
            break;
          case 'error':
            if (!this.ready) {
              reject(new Error(msg.error));
            } else {
              console.error('[HeadPoseAnalyzer]', msg.error);
            }
            break;
        }
      };

      const initMsg: VisionWorkerRequest = { type: 'init' };
      this.worker.postMessage(initMsg);
    });
  }

  /**
   * Begin sending video frames to the worker at ~5 fps.
   * @param video - The HTMLVideoElement with the live camera feed
   * @param onFrame - Optional callback fired for each processed frame
   */
  startProcessing(
    video: HTMLVideoElement,
    onFrame?: (frame: EngagementFrame) => void,
  ): void {
    this.onFrame = onFrame;
    this.frames = [];

    // 5 fps = 200ms interval
    this.intervalId = setInterval(() => {
      if (!this.worker || !this.ready) return;
      if (video.readyState < video.HAVE_CURRENT_DATA) return;

      createImageBitmap(video).then((bitmap) => {
        const msg: VisionWorkerRequest = {
          type: 'process_frame',
          frame: bitmap,
          timestamp_ms: performance.now(),
        };
        this.worker!.postMessage(msg, [bitmap]);
      });
    }, 200);
  }

  stopProcessing(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  getFrames(): EngagementFrame[] {
    return this.frames;
  }

  /** Clears raw frame data from memory (privacy requirement) */
  clearFrames(): void {
    this.frames = [];
  }

  shutdown(): void {
    this.stopProcessing();
    if (this.worker) {
      const msg: VisionWorkerRequest = { type: 'shutdown' };
      this.worker.postMessage(msg);
      this.worker = null;
    }
    this.ready = false;
  }
}
