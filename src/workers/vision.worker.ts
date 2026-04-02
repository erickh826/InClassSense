/**
 * vision.worker.ts
 *
 * Runs MediaPipe FaceLandmarker in a Web Worker for per-frame engagement analysis.
 *
 * v2 changes (optimised vision stats):
 *   1. numFaces raised from 1 → 4 (multi-person scenes)
 *   2. outputFaceBlendshapes enabled — replaces face-api.js for emotion detection
 *   3. Attention yawRatio threshold relaxed from 0.3 → 0.45 (interview context)
 *   4. Multi-face aggregation: emotion = dominant across all faces; attention = any face looking
 */
import type { FaceLandmarker } from '@mediapipe/tasks-vision';
import type { EmotionTag } from '../engagement/types';
import type {
  VisionWorkerRequest,
  VisionWorkerResponse,
  EngagementFrame,
} from '../engagement/types';

// ─── MediaPipe WASM loader polyfill ───────────────────────
// MediaPipe's `ta()` tries importScripts(), then `self.import()` for Emscripten glue (`*_internal.js`).
// 1) `self.import` is not a browser API — we polyfill it.
// 2) Real `import()` loads that file as an ES module, so `var ModuleFactory` never hits `self`
//    → "ModuleFactory not set." Fetch + indirect eval runs it like a classic script (same as importScripts).
function isMediapipeWasmLoaderScript(url: string): boolean {
  try {
    const pathname = new URL(url, self.location?.href ?? undefined).pathname;
    return /\/[^/]+_internal\.js$/i.test(pathname);
  } catch {
    return url.includes('_internal.js');
  }
}

/** Allowlist of trusted origins for MediaPipe WASM loader scripts */
const TRUSTED_MEDIAPIPE_ORIGINS = new Set([
  'https://cdn.jsdelivr.net',
  'https://storage.googleapis.com',
]);

async function loadScriptLikeImportScripts(url: string): Promise<void> {
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    throw new Error(`Invalid URL for WASM loader: ${url}`);
  }
  if (!TRUSTED_MEDIAPIPE_ORIGINS.has(origin)) {
    throw new Error(`Untrusted origin for WASM loader script: ${origin}`);
  }
  const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!res.ok) {
    throw new Error(`Failed to load ${url}: ${res.status} ${res.statusText}`);
  }
  const code = await res.text();
  (0, eval)(code);
}

const w = self as typeof self & { import?: (specifier: string) => Promise<unknown> };
if (typeof w.import !== 'function') {
  w.import = async (specifier: string) => {
    if (isMediapipeWasmLoaderScript(specifier)) {
      await loadScriptLikeImportScripts(specifier);
      return;
    }
    return import(/* @vite-ignore */ specifier);
  };
}

// ─── Constants ────────────────────────────────────────────
const MAX_FACES = 4;
const YAW_THRESHOLD = 0.45;

// Blendshape thresholds (tuned for MediaPipe face_landmarker v1)
const SMILE_THRESHOLD = 0.4;       // mouthSmileLeft + mouthSmileRight average
const SURPRISE_THRESHOLD = 0.35;   // eyeWideLeft + eyeWideRight average
const CONFUSED_THRESHOLD = 0.3;    // browDownLeft + browDownRight average (furrowed brows)

// ─── State ────────────────────────────────────────────────
let faceLandmarker: FaceLandmarker | null = null;

// ─── Blendshape-based emotion detection ───────────────────
/**
 * Maps MediaPipe blendshape coefficients to an EmotionTag.
 *
 * Blendshape categories used:
 *   - mouthSmileLeft, mouthSmileRight → happy
 *   - eyeWideLeft, eyeWideRight → surprised
 *   - browDownLeft, browDownRight → confused (furrowed brows)
 *
 * Priority: happy > surprised > confused > neutral
 */
function blendshapesToEmotion(
  blendshapes: Array<{ categoryName: string; score: number }>,
): EmotionTag {
  const bs: Record<string, number> = {};
  for (const b of blendshapes) {
    bs[b.categoryName] = b.score;
  }

  // Smile detection
  const smileAvg =
    ((bs['mouthSmileLeft'] ?? 0) + (bs['mouthSmileRight'] ?? 0)) / 2;
  if (smileAvg >= SMILE_THRESHOLD) return 'happy';

  // Surprise detection
  const surpriseAvg =
    ((bs['eyeWideLeft'] ?? 0) + (bs['eyeWideRight'] ?? 0)) / 2;
  if (surpriseAvg >= SURPRISE_THRESHOLD) return 'surprised';

  // Confused detection (furrowed brows)
  const confusedAvg =
    ((bs['browDownLeft'] ?? 0) + (bs['browDownRight'] ?? 0)) / 2;
  if (confusedAvg >= CONFUSED_THRESHOLD) return 'confused';

  return 'neutral';
}

// ─── Head pose attention ──────────────────────────────────
function isLookingAtScreen(
  landmarks: Array<{ x: number; y: number; z: number }>,
): boolean {
  const nose = landmarks[1];
  const leftEar = landmarks[93];
  const rightEar = landmarks[323];
  if (!nose || !leftEar || !rightEar) return false;
  const faceWidth = Math.abs(rightEar.x - leftEar.x);
  if (faceWidth < 0.001) return false;
  const noseOffset = nose.x - (leftEar.x + rightEar.x) / 2;
  const yawRatio = noseOffset / faceWidth;
  return Math.abs(yawRatio) < YAW_THRESHOLD;
}

// ─── Initialisation ───────────────────────────────────────
async function init() {
  const vision = await import('@mediapipe/tasks-vision');
  const { FaceLandmarker, FilesetResolver } = vision;
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
    numFaces: MAX_FACES,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: false,
  });
  // face-api.js is no longer needed — blendshapes handle emotion detection
}

// ─── Per-frame processing (multi-face aggregation) ────────
/**
 * Processes a single video frame and returns an aggregated EngagementFrame.
 *
 * Multi-face aggregation rules:
 *   - is_present: true if ANY face is detected
 *   - is_looking_at_screen: true if ANY face is looking at screen
 *   - emotion: dominant non-neutral emotion across all faces;
 *              priority: happy > surprised > confused > neutral
 *              if no face detected → 'absent'
 */
async function processFrame(
  bitmap: ImageBitmap,
  timestampMs: number,
): Promise<EngagementFrame> {
  let isPresent = false;
  let lookingAtScreen = false;
  let emotion: EmotionTag = 'absent';

  if (faceLandmarker) {
    const result = faceLandmarker.detectForVideo(bitmap, timestampMs);
    const numDetected = result.faceLandmarks?.length ?? 0;

    if (numDetected > 0) {
      isPresent = true;

      const faceEmotions: EmotionTag[] = [];

      for (let i = 0; i < numDetected; i++) {
        // Attention: any face looking at screen counts
        if (result.faceLandmarks[i]) {
          if (isLookingAtScreen(result.faceLandmarks[i])) {
            lookingAtScreen = true;
          }
        }

        // Emotion via blendshapes
        if (result.faceBlendshapes && result.faceBlendshapes[i]) {
          const categories = result.faceBlendshapes[i].categories;
          if (categories && categories.length > 0) {
            faceEmotions.push(blendshapesToEmotion(categories));
          }
        }
      }

      // Aggregate emotions with priority: happy > surprised > confused > neutral
      if (faceEmotions.length > 0) {
        if (faceEmotions.includes('happy')) {
          emotion = 'happy';
        } else if (faceEmotions.includes('surprised')) {
          emotion = 'surprised';
        } else if (faceEmotions.includes('confused')) {
          emotion = 'confused';
        } else {
          emotion = 'neutral';
        }
      } else {
        emotion = 'neutral';
      }
    }
  }

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
      self.close();
      break;
    }
  }
};
