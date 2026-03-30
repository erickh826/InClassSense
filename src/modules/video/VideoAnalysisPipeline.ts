/**
 * VideoAnalysisPipeline
 *
 * Orchestrates the full video analysis flow:
 *   1. Frame extraction → vision worker → EngagementFrame[]
 *   2. Audio extraction → chunked WAV blobs
 *   3. Transcription chunks → /api/transcribe → Utterance[] (with timestamps)
 *   4. Aggregate engagement stats
 *   5. Assemble SessionPayload
 *   6. Call /api/chat (via reportGenerator) → markdown report
 *
 * Progress reporting uses a coarse phase system (0–100).
 */

import type { EngagementFrame, Utterance, SessionPayload, SessionEngagementStats } from '../engagement/types';
import { extractAudioChunks } from './AudioExtractor';
import { VideoFrameExtractor } from './VideoFrameExtractor';
import { generateReport } from '../../api/reportGenerator';
import type { ModeConfig } from '../../config/types';

export interface PipelineOptions {
  file: File;
  config: ModeConfig;
  extras: Record<string, string>;   // { input, output } from VideoUploadPage
  speechLang?: string;              // override, default from config
  worker: Worker;                   // caller creates & owns the vision worker
  onProgress?: (phase: PipelinePhase, pct: number, label: string) => void;
}

export type PipelinePhase =
  | 'frames'
  | 'audio'
  | 'transcribe'
  | 'report'
  | 'done';

export interface PipelineResult {
  report: string;
  payload: SessionPayload;
}

// ─── Transcript word → Utterance grouping ────────────────────────────────────

interface SpeechWord {
  word: string;
  offset_ms: number;
  duration_ms: number;
}

/** Group flat word arrays into sentence-level Utterances (split on ~4s silence) */
function wordsToUtterances(
  words: SpeechWord[],
  frames: EngagementFrame[],
  chunkStartSec: number,
): Utterance[] {
  if (words.length === 0) return [];

  const PAUSE_THRESHOLD_MS = 800;
  const utterances: Utterance[] = [];
  let sentenceWords: SpeechWord[] = [words[0]];

  for (let i = 1; i < words.length; i++) {
    const gap = words[i].offset_ms - (words[i - 1].offset_ms + words[i - 1].duration_ms);
    if (gap > PAUSE_THRESHOLD_MS) {
      utterances.push(buildUtterance(sentenceWords, frames, chunkStartSec));
      sentenceWords = [];
    }
    sentenceWords.push(words[i]);
  }
  if (sentenceWords.length > 0) {
    utterances.push(buildUtterance(sentenceWords, frames, chunkStartSec));
  }
  return utterances;
}

function buildUtterance(
  words: SpeechWord[],
  frames: EngagementFrame[],
  chunkStartSec: number,
): Utterance {
  const startMs = words[0].offset_ms + chunkStartSec * 1000;
  const mm = String(Math.floor(startMs / 60000)).padStart(2, '0');
  const ss = String(Math.floor((startMs % 60000) / 1000)).padStart(2, '0');
  const text = words.map(w => w.word).join(' ');

  // Find closest frame emotion
  let emotionContext: EngagementFrame['emotion'] | undefined;
  if (frames.length > 0) {
    const closest = frames.reduce((prev, cur) =>
      Math.abs(cur.timestamp_ms - startMs) < Math.abs(prev.timestamp_ms - startMs) ? cur : prev
    );
    emotionContext = closest.emotion;
  }

  return {
    time: `${mm}:${ss}`,
    speaker: 'Student',
    text,
    emotion_context: emotionContext,
  };
}

// ─── Stats aggregation ────────────────────────────────────────────────────────

function aggregateStats(frames: EngagementFrame[]): SessionEngagementStats {
  if (frames.length === 0) {
    return { overall_attention_rate: 0, smile_count: 0, confused_count: 0, surprised_count: 0, absence_count: 0 };
  }
  const present = frames.filter(f => f.is_present);
  const looking = frames.filter(f => f.is_looking_at_screen);
  return {
    overall_attention_rate: Math.round((looking.length / frames.length) * 100),
    smile_count:     present.filter(f => f.emotion === 'happy').length,
    confused_count:  present.filter(f => f.emotion === 'confused').length,
    surprised_count: present.filter(f => f.emotion === 'surprised').length,
    absence_count:   frames.filter(f => !f.is_present).length,
  };
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

export async function runVideoAnalysisPipeline(opts: PipelineOptions): Promise<PipelineResult> {
  const { file, config, extras, worker, onProgress } = opts;
  const lang = opts.speechLang ?? config.speechLang;

  // ── Phase 1: Frame extraction ────────────────────────────────
  onProgress?.('frames', 0, '正在提取視頻幀...');
  const extractor = new VideoFrameExtractor(file, worker, { fps: 1 });
  const frames = await extractor.run((pct) => {
    onProgress?.('frames', pct, `視頻幀提取中... ${pct}%`);
  });
  extractor.dispose();
  onProgress?.('frames', 100, `已提取 ${frames.length} 幀`);

  // ── Phase 2: Audio extraction ────────────────────────────────
  onProgress?.('audio', 0, '正在提取音頻...');
  const chunks = await extractAudioChunks(file, (pct) => {
    onProgress?.('audio', pct, `音頻處理中... ${pct}%`);
  });
  onProgress?.('audio', 100, `已生成 ${chunks.length} 個音頻片段`);

  // ── Phase 3: Transcription ───────────────────────────────────
  onProgress?.('transcribe', 0, '正在識別語音...');
  const allUtterances: Utterance[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const pct = Math.round(((i + 1) / chunks.length) * 100);
    onProgress?.('transcribe', pct, `語音識別 ${i + 1}/${chunks.length}...`);

    try {
      const audioBuffer = await chunk.blob.arrayBuffer();
      const response = await fetch(`/api/transcribe?lang=${encodeURIComponent(lang)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'audio/wav' },
        body: audioBuffer,
      });

      if (!response.ok) {
        console.warn(`Transcription chunk ${i} failed: ${response.status}`);
        continue;
      }

      const data = await response.json() as { text: string; words?: SpeechWord[] };
      const words: SpeechWord[] = data.words ?? [];

      if (words.length > 0) {
        const utterances = wordsToUtterances(words, frames, chunk.startSec);
        allUtterances.push(...utterances);
      } else if (data.text) {
        // Fallback: no word timestamps, make one utterance per chunk
        const mm = String(Math.floor(chunk.startSec / 60)).padStart(2, '0');
        const ss = String(Math.floor(chunk.startSec % 60)).padStart(2, '0');
        allUtterances.push({ time: `${mm}:${ss}`, speaker: 'Student', text: data.text });
      }
    } catch (err) {
      console.warn(`Transcription chunk ${i} error:`, err);
    }
  }
  onProgress?.('transcribe', 100, `識別完成，${allUtterances.length} 句話語`);

  // ── Phase 4: Assemble payload & generate report ──────────────
  onProgress?.('report', 0, '正在生成 AI 分析報告...');

  const stats = aggregateStats(frames);
  const payload: SessionPayload = {
    session_info: {
      duration_seconds: Math.round(frames.length),   // 1 fps → frames ≈ seconds
      topic: extras['input'] || '影片分析',
    },
    engagement_stats: stats,
    multimodal_transcript: allUtterances,
  };

  const report = await generateReport(payload, config, extras);
  onProgress?.('report', 100, '報告生成完成');
  onProgress?.('done', 100, '完成');

  return { report, payload };
}
