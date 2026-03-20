# MODULE SPEC: Multimodal Child Development Observation
# Version: 1.0 | Target: Preschool AI Engagement PoC
# Stack: TypeScript + React/Vite + MediaPipe + face-api.js

---

## OVERVIEW
Single-session module that simultaneously captures:
- VERBAL: Speech-to-text transcript with timestamps
- VISUAL: Client-side emotion + attention analysis (NO server upload)

Produces a structured JSON payload → fed to LLM → generates teacher report.

---

## CONSTRAINTS (Non-negotiable)
- NO video/frame data leaves the browser. Ever.
- ALL vision inference runs in Web Worker (off main thread)
- Vision models: MediaPipe Face Landmarker (attention) + face-api.js TinyFaceDetector (emotion)
- LLM is called ONCE, at session end only
- Compatible with iPad / Chromebook (target ≥15fps inference)

---

## MODULE STRUCTURE

```
src/
├── modules/engagement/
│   ├── EngagementTracker.ts       # Orchestrator: starts/stops both analyzers
│   ├── HeadPoseAnalyzer.ts        # MediaPipe: attention score from head pose
│   ├── EmotionDetector.ts         # face-api.js: emotion tagging per utterance
│   ├── TimelineSyncer.ts          # Binds emotion snapshot to transcript line
│   └── types.ts                   # All shared interfaces (see below)
├── modules/speech/
│   ├── SpeechCapture.ts           # Web Speech API or Whisper (configurable)
│   └── TranscriptBuilder.ts       # Builds utterance array with timestamps
└── api/
    └── reportGenerator.ts         # Packages payload + calls LLM endpoint
```

---

## DATA TYPES

```typescript
// types.ts

export type EmotionTag = 'happy' | 'confused' | 'surprised' | 'neutral' | 'absent';

export interface EngagementFrame {
  timestamp_ms: number;
  is_present: boolean;
  is_looking_at_screen: boolean;
  emotion: EmotionTag;
}

export interface Utterance {
  time: string;            // "MM:SS"
  speaker: 'AI' | 'Student';
  text: string;
  emotion_context?: EmotionTag;  // injected by TimelineSyncer
}

export interface SessionEngagementStats {
  overall_attention_rate: number;   // 0–100 (%)
  smile_count: number;
  confused_count: number;
  surprised_count: number;
  absence_count: number;
}

export interface SessionPayload {
  session_info: {
    duration_seconds: number;
    topic: string;
  };
  engagement_stats: SessionEngagementStats;
  multimodal_transcript: Utterance[];
}
```

---

## LOGIC: HEAD POSE → ATTENTION

```typescript
// HeadPoseAnalyzer.ts
// MediaPipe landmarks used: nose tip [1], left ear [93], right ear [323]

function isLookingAtScreen(landmarks: NormalizedLandmark[]): boolean {
  const nose = landmarks[1];
  const leftEar = landmarks[93];
  const rightEar = landmarks[323];
  const faceWidth = Math.abs(rightEar.x - leftEar.x);
  const noseOffset = nose.x - (leftEar.x + rightEar.x) / 2;
  const yawRatio = noseOffset / faceWidth;  // range: -0.5 to +0.5
  return Math.abs(yawRatio) < 0.3;          // threshold: adjustable
}
```

---

## LOGIC: TIMELINE SYNCER

```typescript
// TimelineSyncer.ts
// At the moment Student finishes an utterance, snapshot the latest EngagementFrame
// and attach emotion_context to that Utterance object.

function attachEmotion(utterance: Utterance, frames: EngagementFrame[]): Utterance {
  const utteranceMs = parseTimeToMs(utterance.time);
  const closest = frames.reduce((prev, curr) =>
    Math.abs(curr.timestamp_ms - utteranceMs) < Math.abs(prev.timestamp_ms - utteranceMs)
      ? curr : prev
  );
  return { ...utterance, emotion_context: closest.emotion };
}
```

---

## LLM INTEGRATION: PROMPT TEMPLATE

```typescript
// reportGenerator.ts

const SYSTEM_PROMPT = `
你是一位具備教育心理學背景的幼兒教育專家。
根據以下的【多模態對話紀錄】與【非語言統計數據】,
撰寫一份給老師的兒童發展觀察報告，使用 Markdown 格式，
嚴格包含以下三個段落：
1. 語言溝通能力評估（詞彙量、句型、理解力、表達流暢度）
2. 情緒投入度評估（專注度、表情時機、遇困難時的情緒反應）
3. 建議觀察重點（具體給老師的下次引導方向）
`;

function buildUserPrompt(payload: SessionPayload): string {
  return `
【統計數據】
${JSON.stringify(payload.engagement_stats, null, 2)}

【多模態對話紀錄（含當下表情）】
${JSON.stringify(payload.multimodal_transcript, null, 2)}
`.trim();
}
```

---

## SAMPLE OUTPUT PAYLOAD (sent to LLM)

```json
{
  "session_info": { "duration_seconds": 300, "topic": "動物園探險" },
  "engagement_stats": {
    "overall_attention_rate": 85,
    "smile_count": 5,
    "confused_count": 2,
    "surprised_count": 1,
    "absence_count": 1
  },
  "multimodal_transcript": [
    { "time": "00:15", "speaker": "AI",      "text": "你最喜歡什麼動物呢？" },
    { "time": "00:18", "speaker": "Student", "text": "我喜歡大象！", "emotion_context": "happy" },
    { "time": "01:20", "speaker": "AI",      "text": "你知道長頸鹿吃什麼嗎？" },
    { "time": "01:25", "speaker": "Student", "text": "不知道...", "emotion_context": "confused" }
  ]
}
```

---

## PRIVACY CHECKLIST (implement before demo)
- [ ] Vision inference runs inside dedicated Web Worker
- [ ] `canvas.toBlob()` is never called; only landmark float arrays are returned
- [ ] `MediaStream.getTracks().forEach(t => t.stop())` called on session end
- [ ] UI shows "本地 AI 分析中，影像不會離開您的設備" badge when camera is active
- [ ] rawFrames array cleared from memory after stats are computed
