# InClassSense — 多模態兒童發展觀察系統

Browser-based AI observation tool for preschool educators. Captures a child's verbal responses and non-verbal cues (attention, emotion) during learning activities, then generates a structured development report via LLM.

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
                                  SessionPayload ──► Azure OpenAI ──► Teacher Report (Markdown)
```

**All vision inference runs client-side. No video or image data leaves the browser.**

## Key features

- **Head pose attention tracking** — MediaPipe Face Landmarker detects whether the child is looking at the screen
- **Emotion detection** — face-api.js TinyFaceDetector classifies expressions (happy / confused / surprised / neutral / absent)
- **Speech transcription** — Web Speech API captures student utterances with timestamps (zh-TW)
- **Timeline sync** — each utterance is tagged with the emotion detected at that moment
- **LLM report generation** — one API call at session end produces a structured Markdown report covering language ability, emotional engagement, and teacher recommendations

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite |
| Vision | MediaPipe Face Landmarker + face-api.js (Web Worker) |
| Speech | Web Speech API (SpeechRecognition) |
| LLM | Azure OpenAI (proxied via Vite dev server) |

## Project structure

```
src/
├── modules/
│   ├── engagement/
│   │   ├── types.ts              # Shared interfaces + worker protocol
│   │   ├── EngagementTracker.ts  # Orchestrator: start/stop session
│   │   ├── HeadPoseAnalyzer.ts   # Manages vision Web Worker + frame loop
│   │   ├── EmotionDetector.ts    # Latest-emotion snapshot accessor
│   │   └── TimelineSyncer.ts     # Binds emotion to transcript utterance
│   └── speech/
│       ├── SpeechCapture.ts      # Web Speech API wrapper
│       └── TranscriptBuilder.ts  # Accumulates utterances with MM:SS timestamps
├── workers/
│   └── vision.worker.ts          # Off-main-thread MediaPipe + face-api inference
├── api/
│   └── reportGenerator.ts        # Azure OpenAI chat completion call
└── components/
    ├── SessionPage.tsx            # Main UI: camera + transcript + controls
    ├── PrivacyBadge.tsx           # "影像不會離開您的設備" indicator
    └── ReportView.tsx             # Renders LLM Markdown report
```

## Setup

```bash
# Install dependencies
npm install

# Configure Azure OpenAI credentials
cp .env.example .env.local
# Edit .env.local with your Azure resource name, API key, and deployment name

# Start dev server
npm run dev
```

### `.env.local` variables

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_LLM_API_URL` | Azure OpenAI resource endpoint | `https://myresource.openai.azure.com` |
| `VITE_LLM_API_KEY` | Azure API key | `abc123...` |
| `VITE_LLM_DEPLOYMENT` | Deployment name | `gpt-4o` |
| `VITE_LLM_API_VERSION` | API version | `2024-12-01-preview` |

## Browser support

- **Chrome / Edge** (desktop & Android) — full support
- **Safari** (iPad) — camera + vision works; Web Speech API has limited support
- **Firefox** — Web Speech API not supported; vision-only mode

## Privacy

- Vision inference runs inside a dedicated Web Worker
- `canvas.toBlob()` is never called — only float landmark arrays cross the worker boundary
- Camera tracks are stopped immediately on session end
- Raw frame data is cleared from memory after stats are computed
- A visible badge ("本地 AI 分析中，影像不會離開您的設備") is shown while the camera is active
