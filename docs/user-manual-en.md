# InClassSense User Manual

## Table of Contents

1. [Introduction](#introduction)
2. [System Requirements](#system-requirements)
3. [Getting Started](#getting-started)
4. [Observation Modes](#observation-modes)
5. [Step-by-Step Guide](#step-by-step-guide)
6. [Understanding Reports](#understanding-reports)
7. [Privacy & Security](#privacy--security)
8. [FAQ](#faq)

---

## Introduction

InClassSense is a multimodal AI observation and assessment platform designed for educators and interviewers. Using the device's camera and microphone, the system analyses the subject's:

- **Attention** — head pose detection to determine if the subject is looking at the screen
- **Emotion** — real-time facial expression classification (happy, confused, surprised, neutral, or absent)
- **Speech** — speech-to-text transcription with timestamps

All vision analysis is performed locally on your device — **no video or image data is ever uploaded to any server**. When the observation session ends, the system sends only the statistical summary and text transcript to an AI language model to generate a structured assessment report.

---

## System Requirements

| Item | Requirement |
|------|------------|
| Browser | Chrome or Edge (desktop or Android) — **recommended** |
| | Safari (iPad) — camera and emotion detection work; speech recognition has limited support |
| | Firefox — speech recognition not supported; vision-only mode |
| Hardware | Front or rear camera, microphone |
| Network | Required for loading models and generating reports |

---

## Getting Started

1. Open the InClassSense URL in your browser
2. The landing page displays three observation mode cards
3. Tap or click the mode you want to use

---

## Observation Modes

### 🧒 Child Development Observation

**Use case:** Preschool classroom activities, one-on-one teaching interactions

**Features:**
- Records the child's verbal responses (Chinese speech recognition)
- Detects attention level and emotional changes throughout the session
- Generates a child development observation report covering language skills, emotional engagement, and recommended focus areas for teachers

**Default camera:** Rear camera (teacher films facing the child)

### 🗣️ English Speaking Practice

**Use case:** IELTS Speaking simulation and practice

**Features:**
- Records spoken English responses (English speech recognition)
- Accepts a question/prompt input (supports Part 1 / Part 2 / Part 3 question types)
- Tracks confidence and focus during practice
- Generates an IELTS Speaking assessment report with band scores across all four criteria and improvement suggestions

**Default camera:** Front camera (selfie mode)

**Additional input:** Question prompt (e.g. "Describe a place you enjoy visiting.")

### 🎤 Interview Assessment

**Use case:** Kindergarten admission interviews, university internship interviews

**Features:**
- Two interview mode variants:
  - 👶 **Kindergarten Admission** — evaluates language development, social-emotional readiness, and learning preparedness (report in Chinese)
  - 🎓 **University Internship** — evaluates communication, critical thinking, composure, and fit (report in English)
- Accepts interview question input
- Detects emotional stability and attention during the interview
- Generates a structured interview evaluation report

**Default camera:** Front camera

**Additional input:** Interview question

---

## Step-by-Step Guide

### Step 1: Select a Mode

On the landing page, tap the card for the observation mode you want to use.

### Step 2: Configure the Session

After entering the observation interface, you'll see the following settings:

1. **Topic / Position** — enter the subject or title for this session
2. **Additional fields** (some modes) — e.g. speaking question, interview prompt
3. **Variant toggle** (interview mode only) — switch between Kindergarten Admission and University Internship
4. **Camera toggle** — tap "🤳 Front Camera" or "📷 Rear Camera" to switch

### Step 3: Start the Observation

1. Tap the **"▶ 開始觀察"** (Start Observation) button
2. The system will request camera and microphone permissions — **please allow both**
3. The live camera feed will appear, with real-time emotion and gaze indicators below the video
4. A green privacy badge will appear: "本地 AI 分析中，影像不會離開您的設備" (Local AI analysis — video does not leave your device)
5. The transcript panel on the right will show speech-to-text results in real time

### Step 4: End the Observation

1. Tap the **"■ 結束觀察"** (End Observation) button
2. The camera and microphone will stop immediately
3. The system automatically computes engagement statistics and syncs emotion tags to the transcript
4. A "Generating report…" indicator will appear

### Step 5: View the Report

- The report is rendered in Markdown format below the session area
- Report content varies depending on the selected mode
- To return to the landing page and select a different mode, use the back button at the top of the page

---

## Understanding Reports

### Child Development Observation Report:

1. **Language & Communication Assessment** — vocabulary range, sentence structure, comprehension, fluency
2. **Emotional Engagement Assessment** — attention rate, expression timing, emotional responses when encountering difficulty
3. **Recommended Focus Areas** — specific guidance for the teacher's next session

### IELTS Speaking Assessment Report:

1. **Overall Band Score** — 0–9 scale (to 0.5 precision)
2. **Four Criteria Breakdown** — Fluency & Coherence, Lexical Resource, Grammatical Range & Accuracy, Pronunciation
3. **Specific Quotations** — examples cited from the transcript
4. **Improvement Suggestions** — concrete areas to work on

### Interview Evaluation Report:

- **Kindergarten Admission:** language development, social-emotional readiness, learning preparedness, overall recommendation
- **University Internship:** communication skills, critical thinking, composure & professionalism, fit & growth potential, hiring recommendation (Strong Yes / Yes / Maybe / No)

---

## Privacy & Security

| Measure | Details |
|---------|--------|
| Local vision processing | All face detection and emotion recognition runs on your device using Web Worker technology |
| No image storage | The system never captures screenshots or records video — only real-time facial landmark coordinates are processed |
| Immediate camera shutdown | The camera stops as soon as the observation ends |
| Data clearance | Raw analysis data is cleared from memory after statistics are computed |
| API key security | The LLM API key is stored server-side only (Vercel serverless function) and is never sent to the browser |
| Privacy indicator | A visible privacy badge is shown throughout the session whenever the camera is active |

---

## FAQ

### Q: Why isn't speech recognition working?

- Make sure you're using Chrome or Edge
- Confirm that you've granted microphone permission
- Check that your device's microphone is working
- Safari and Firefox have limited or no speech recognition support

### Q: Why does the camera feed look mirrored?

When using the front camera, the video is mirrored (like a selfie) for a natural feel. The rear camera is not mirrored. This does not affect the analysis.

### Q: The emotion indicator shows "👤 Face not detected"?

Ensure the subject's face is within the camera frame, the lighting is adequate, and the face is not obscured.

### Q: Report generation failed?

- Check your internet connection
- If the issue persists, the LLM service may be temporarily unavailable — try again later

### Q: Can I use this on an iPad?

Yes. We recommend Chrome on iPad for the best experience. Safari supports camera and emotion detection, but speech recognition may not work fully.

### Q: Where does my data go?

- **Video / camera data:** Never leaves your device
- **Speech-to-text results:** Processed via the browser's built-in Web Speech API (handling varies by browser)
- **Statistics and transcript:** Sent to Azure OpenAI at session end to generate the report
