// Static top-level imports — Vite bundles these at build time into the worker chunk.
// This avoids runtime dynamic import() calls which fail on Android Chrome WebView
// with "self.import is not a function".
import * as faceapi from 'face-api.js';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

import type { EmotionTag } from '../engagement/types';
import type {
  VisionWorkerRequest,
  VisionWorkerResponse,
  EngagementFrame,
} from '../engagement/types';

// ─── MediaPipe Face Landmarker ────────────────────────────
let faceLandmarker: FaceLandmarker | null = null;

// ─── face-api.js ──────────────────────────────────────────
let faceApiReady = false;

/**
 * Map face-api.js expression labels → our EmotionTag.
 * face-api returns: neutral, happy, sad, angry, fearful, disgusted, surprised
 */
function mapExpression(expressions: Record<string, number>): EmotionTag {
  let maxLabel = 'neutral';
  let maxScore = 0;
  for (const [label, score] of Object.entries(expressions)) {
    if (score > maxScore) {
      maxScore = score;
      maxLabel = label;
    }
  }
  switch (maxLabel) {
    case 'happy':
      return 'happy';
    case 'surprised':
      return 'surprised';
    case 'fearful':
    case 'sad':
      return 'confused';
    default:
      return 'neutral';
  }
}

// ─── Head pose attention ──────────────────────────────────
function isLookingAtScreen(landmarks: Array<{ x: number; y: number; z: number }>): boolean {
  const nose = landmarks[1];
  const leftEar = landmarks[93];
  const rightEar = landmarks[323];
  if (!nose || !leftEar || !rightEar) return false;

  const faceWidth = Math.abs(rightEar.x - leftEar.x);
  if (faceWidth < 0.001) return false;
  const noseOffset = nose.x - (leftEar.x + rightEar.x) / 2;
  const yawRatio = noseOffset / faceWidth;
  return Math.abs(yawRatio) < 0.3;
}

// ─── Initialisation ───────────────────────────────────────
async function init() {
  // MediaPipe Face Landmarker
  const filesetResolver = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm',
  );

  faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
    baseOptions: {
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  });

  // face-api.js — load models from /models (served from public/models/)
  try {
    const modelPath = '/models';
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(modelPath),
      faceapi.nets.faceExpressionNet.loadFromUri(modelPath),
    ]);
    faceApiReady = true;
  } catch (e) {
    console.warn('[vision.worker] face-api.js load failed, emotion detection disabled:', e);
    faceApiReady = false;
  }
}

// ─── Per-frame processing ─────────────────────────────────
async function processFrame(
  bitmap: ImageBitmap,
  timestampMs: number,
): Promise<EngagementFrame> {
  let isPresent = false;
  let lookingAtScreen = false;
  let emotion: EmotionTag = 'absent';

  // 1) MediaPipe head pose
  if (faceLandmarker) {
    const result = faceLandmarker.detectForVideo(bitmap, timestampMs);
    if (result.faceLandmarks && result.faceLandmarks.length > 0) {
      isPresent = true;
      lookingAtScreen = isLookingAtScreen(result.faceLandmarks[0]);
    }
  }

  // 2) face-api.js emotion
  if (faceApiReady && isPresent) {
    try {
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0);
        const detection = await faceapi
          .detectSingleFace(canvas as unknown as HTMLCanvasElement, new faceapi.TinyFaceDetectorOptions())
          .withFaceExpressions();
        if (detection) {
          emotion = mapExpression(detection.expressions as unknown as Record<string, number>);
        } else {
          emotion = 'neutral';
        }
      }
    } catch {
      emotion = 'neutral';
    }
  }

  // Release the bitmap
  bitmap.close();

  return {
    timestamp_ms: timestampMs,
    is_present: isPresent,
    is_looking_at_screen: lookingAtScreen,
    emotion,
  };
}

// ─── Worker message handler ───────────────────────────────
self.onmessage = async (e: MessageEvent<VisionWorkerRequest>) => {
  const msg = e.data;

  switch (msg.type) {
    case 'init': {
      try {
        await init();
        const resp: VisionWorkerResponse = { type: 'ready' };
        self.postMessage(resp);
      } catch (err) {
        const resp: VisionWorkerResponse = {
          type: 'error',
          error: `Init failed: ${err}`,
        };
        self.postMessage(resp);
      }
      break;
    }

    case 'process_frame': {
      if (!msg.frame || msg.timestamp_ms == null) break;
      try {
        const frame = await processFrame(msg.frame, msg.timestamp_ms);
        const resp: VisionWorkerResponse = { type: 'frame_result', frame };
        self.postMessage(resp);
      } catch (err) {
        const resp: VisionWorkerResponse = {
          type: 'error',
          error: `Frame processing failed: ${err}`,
        };
        self.postMessage(resp);
      }
      break;
    }

    case 'shutdown': {
      faceLandmarker?.close();
      faceLandmarker = null;
      faceApiReady = false;
      self.close();
      break;
    }
  }
};
