# InClassSense — 多模態 AI 觀察與評估平台 V3

Browser-based multimodal AI observation platform for educators. Captures verbal responses and non-verbal cues (attention, emotion) via camera and microphone — all processed locally on-device — then generates structured assessment reports via LLM.

## Observation Modes

| Mode | Description | Language |
|------|------------|----------|
| 🧒 **幼兒發展觀察** | Tracks a child's language, emotion and attention during learning activities. Generates a teacher development report. | zh-TW |
| 🗣️ **英語口語練習** | IELTS Speaking practice with band-score assessment across all four criteria. | en-US |
| 🎤 **面試評核** | Interview assessment with two variants: 👶 Kindergarten admission & 🎓 University internship. | zh-TW |

## How it works

```
Camera ──► Web Worker (MediaPipe + face-api.js) ──► Engagement Frames
                                                         │
Microphone ──► Web Speech API ──► Transcript              │
                                       │                  │
                                       ▼                  ▼
                                  TimelineSyncer (bind emotion → utterance)
                                       │
                                       ▼
                                  SessionPayload ──► Azure OpenAI (via Vercel serverless) ──► Report
```

**All vision inference runs client-side. No video or image data leaves the browser.**

## Key features

- **Head pose attention tracking** — MediaPipe Face Landmarker detects whether the subject is looking at the screen
- **Emotion detection** — face-api.js TinyFaceDetector classifies expressions (happy / confused / surprised / neutral / absent)
- **Speech transcription** — Web Speech API captures utterances with timestamps (zh-TW or en-US per mode)
- **Timeline sync** — each utterance is tagged with the emotion detected at that moment
- **Multi-mode config system** — pluggable prompt configs with variant support, extra input fields, and per-mode speech language
- **Camera switching** — front/rear camera toggle with mirrored selfie preview
- **LLM report generation** — one API call at session end, routed through a Vercel serverless function (API key never reaches the browser)

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite |
| Vision | MediaPipe Face Landmarker + face-api.js (Web Worker) |
| Speech | Web Speech API (SpeechRecognition) |
| LLM backend | Vercel Serverless Function → Azure OpenAI |
| Deployment | Vercel |

## Project structure

```
├── api/
│   └── chat.ts                        # Vercel serverless: proxies LLM requests to Azure OpenAI
├── vercel.json                        # COOP/COEP headers for SharedArrayBuffer (MediaPipe)
├── public/models/                     # face-api.js model weights (TinyFaceDetector + FaceExpression)
└── src/
    ├── App.tsx                        # Router: LandingPage ↔ SessionRunner
    ├── config/
    │   ├── types.ts                   # ModeConfig interface (variants, extraFields, prompts)
    │   ├── childObservation.config.ts # 🧒 Child development observation
    │   ├── englishSpeaking.config.ts  # 🗣️ IELTS Speaking practice
    │   ├── interview.config.ts        # 🎤 Interview assessment (kindergarten / intern)
    │   └── index.ts                   # ALL_MODES registry
    ├── modules/
    │   ├── engagement/
    │   │   ├── types.ts               # Shared interfaces + worker protocol
    │   │   ├── EngagementTracker.ts   # Orchestrator: start/stop session
    │   │   ├── HeadPoseAnalyzer.ts    # Manages vision Web Worker + frame loop
    │   │   ├── EmotionDetector.ts     # Latest-emotion snapshot accessor
    │   │   └── TimelineSyncer.ts      # Binds emotion to transcript utterance
    │   └── speech/
    │       ├── SpeechCapture.ts       # Web Speech API wrapper
    │       └── TranscriptBuilder.ts   # Accumulates utterances with MM:SS timestamps
    ├── workers/
    │   └── vision.worker.ts           # Off-main-thread MediaPipe + face-api inference
    ├── api/
    │   └── reportGenerator.ts         # Builds prompt from ModeConfig + calls /api/chat
    ├── pages/
    │   ├── LandingPage.tsx            # Mode selection cards
    │   └── SessionRunner.tsx          # Session UI: camera + transcript + controls + report
    └── components/
        ├── PrivacyBadge.tsx           # "影像不會離開您的設備" indicator
        └── ReportView.tsx             # Renders LLM Markdown report
```

## Setup

### Prerequisites

- Node.js 18+
- An Azure OpenAI resource with a deployed chat model (e.g. `gpt-4o`)

### Local development

```bash
# Install dependencies
npm install

# Configure environment (for Vite dev proxy)
cp .env.example .env.local
# Edit .env.local — fill in LLM_API_URL, LLM_API_KEY, LLM_DEPLOYMENT

# Start dev server
npm run dev
```

### Deploy to Vercel

1. Push to GitHub
2. Import the repo in Vercel
3. Set environment variables in Vercel project settings:

| Variable | Description | Example |
|----------|-------------|---------|
| `LLM_API_URL` | Azure OpenAI resource endpoint | `https://myresource.openai.azure.com` |
| `LLM_API_KEY` | Azure API key | `abc123...` |
| `LLM_DEPLOYMENT` | Deployment name | `gpt-4o` |
| `LLM_API_VERSION` | API version | `2024-12-01-preview` |

> **Note:** Do NOT use the `VITE_` prefix — these variables must stay server-side in the Vercel serverless function.

## Browser support

- **Chrome / Edge** (desktop & Android) — full support
- **Safari** (iPad) — camera + vision works; Web Speech API has limited support
- **Firefox** — Web Speech API not supported; vision-only mode

## Privacy

- Vision inference runs inside a dedicated Web Worker
- `canvas.toBlob()` is never called — only float landmark arrays cross the worker boundary
- Camera tracks are stopped immediately on session end
- Raw frame data is cleared from memory after stats are computed
- LLM API key is stored server-side only (Vercel serverless function) — never shipped to the client
- A visible badge ("本地 AI 分析中，影像不會離開您的設備") is shown while the camera is active
