/**
 * VideoFrameExtractor
 *
 * Seeks a <video> element through a File and extracts frames at a fixed
 * interval, sending each as an ImageBitmap to the existing vision.worker.ts.
 *
 * The worker processes frames exactly as it does during live sessions,
 * returning EngagementFrame results via postMessage.
 *
 * Usage:
 *   const extractor = new VideoFrameExtractor(file, worker, { fps: 1 });
 *   const frames = await extractor.run(onProgress);
 *   extractor.dispose();
 */

import type { EngagementFrame, VisionWorkerRequest, VisionWorkerResponse } from '../engagement/types';

export interface FrameExtractorOptions {
  /** Frames per second to sample (default: 1) */
  fps?: number;
}

export class VideoFrameExtractor {
  private videoEl: HTMLVideoElement;
  private objectUrl: string;
  private worker: Worker;
  private fps: number;

  constructor(file: File, worker: Worker, options: FrameExtractorOptions = {}) {
    this.fps     = options.fps ?? 1;
    this.worker  = worker;
    this.objectUrl = URL.createObjectURL(file);

    // Hidden video element — must be in DOM for seek events to fire on all browsers
    this.videoEl = document.createElement('video');
    this.videoEl.preload  = 'auto';
    this.videoEl.muted    = true;
    this.videoEl.playsInline = true;
    this.videoEl.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px';
    document.body.appendChild(this.videoEl);
    this.videoEl.src      = this.objectUrl;
  }

  /** Wait for video metadata to load (duration, dimensions) */
  private waitForMeta(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.videoEl.readyState >= 1) { resolve(); return; }
      this.videoEl.onloadedmetadata = () => resolve();
      this.videoEl.onerror = () => reject(new Error('Video metadata load failed'));
    });
  }

  /** Seek to a specific time and return when the frame is decoded */
  private seekTo(time: number): Promise<void> {
    return new Promise((resolve) => {
      let resolved = false;
      const done = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(fallback);
        this.videoEl.onseeked = null;
        resolve();
      };
      // Safety: if seeked doesn’t fire within 3s, continue anyway
      const fallback = setTimeout(done, 3000);
      this.videoEl.onseeked = done;
      this.videoEl.currentTime = time;
    });
  }

  /**
   * Extract frames, send to vision worker, collect results.
   * @param onProgress  called with 0–100 as frames are processed
   */
  async run(onProgress?: (pct: number) => void): Promise<EngagementFrame[]> {
    await this.waitForMeta();
    const duration   = this.videoEl.duration;
    const interval   = 1 / this.fps;
    const totalFrames = Math.floor(duration / interval);
    const frames: EngagementFrame[] = [];

    // Offscreen canvas for pixel capture
    const canvas  = document.createElement('canvas');
    const ctx     = canvas.getContext('2d')!;
    canvas.width  = this.videoEl.videoWidth  || 640;
    canvas.height = this.videoEl.videoHeight || 480;

    for (let i = 0; i < totalFrames; i++) {
      const timeSec = i * interval;
      await this.seekTo(timeSec);

      // Draw frame to canvas → ImageBitmap → worker
      ctx.drawImage(this.videoEl, 0, 0, canvas.width, canvas.height);
      const bitmap = await createImageBitmap(canvas);

      const result = await this.sendFrameToWorker(bitmap, Math.round(timeSec * 1000));
      if (result) frames.push(result);

      onProgress?.(Math.round(((i + 1) / totalFrames) * 100));
    }

    return frames;
  }

  /** Send one ImageBitmap to the worker and await its EngagementFrame response */
  private sendFrameToWorker(
    bitmap: ImageBitmap,
    timestamp_ms: number,
  ): Promise<EngagementFrame | null> {
    return new Promise((resolve) => {
      const onMessage = (evt: MessageEvent<VisionWorkerResponse>) => {
        if (evt.data.type === 'frame_result') {
          this.worker.removeEventListener('message', onMessage);
          resolve(evt.data.frame ?? null);
        } else if (evt.data.type === 'error') {
          this.worker.removeEventListener('message', onMessage);
          resolve(null);
        }
      };
      this.worker.addEventListener('message', onMessage);

      const msg: VisionWorkerRequest = { type: 'process_frame', frame: bitmap, timestamp_ms };
      this.worker.postMessage(msg, [bitmap]);
    });
  }

  dispose() {
    URL.revokeObjectURL(this.objectUrl);
    this.videoEl.src = '';
    if (this.videoEl.parentNode) {
      this.videoEl.parentNode.removeChild(this.videoEl);
    }
  }
}
