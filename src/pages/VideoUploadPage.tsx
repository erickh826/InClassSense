import { useRef, useState, useCallback } from 'react';
import { ReportView } from '../components/ReportView';
import { runVideoAnalysisPipeline, PipelinePhase } from '../modules/video/VideoAnalysisPipeline';
import type { ModeConfig } from '../config/types';

// ─── Preset Prompts ──────────────────────────────────────────────────────────

interface PresetPrompt {
  label: string;
  input: string;
  output: string;
  lang: string;
}

const PRESET_PROMPTS: PresetPrompt[] = [
  {
    label: '幼稚園課堂',
    input: '幼稚園課堂活動，教學語言廣東話，學生年齡 3–6 歲',
    output: '分析學生的參與度、情緒變化及老師互動技巧，提供具體改善建議',
    lang: 'zh-TW',
  },
 {
  label: 'IELTS 口試練習',
  input: `Act as a certified IELTS Speaking Examiner. Evaluate the following candidate response based on the official 4 criteria. Be strict and objective.

1. Fluency and Coherence: Check for self-correction, hesitation (language vs. content), and use of discourse markers.
2. Lexical Resource: Identify less common vocabulary, idiomatic expressions, and collocation errors.
3. Grammatical Range and Accuracy: Look for complex sentence structures and systematic errors (e.g., tense consistency or articles).
4. Pronunciation: Assess intonation, word stress, and individual sound clarity.`,
  output: `- Table: Band score per criterion.
- Detailed Feedback: Bullet points for "Strengths" and "Specific Errors."
- The "Upgrade" Section: Rewrite 2-3 of the candidate's sentences into a Band 8.5/9.0 level version.
- Overall Band Score & 3 Actionable Improvement Tips.`,
  lang: 'en-US',
},
  {
    label: '大學實習生面試',
    input: '大學生參加初級職位模擬面試，普通話或廣東話作答',
    output: '分析表達能力、回答邏輯、態度自信程度及可改善的溝通技巧',
    lang: 'zh-TW',
  },
  {
    label: '自定義',
    input: '',
    output: '',
    lang: 'zh-TW',
  },
];

// ─── Progress display ─────────────────────────────────────────────────────────
// Phases 'frames' and 'audio' now run in PARALLEL (OPT-A).
// The progress bar shows a merged "提取" step until both finish, then proceeds.

const PHASE_LABEL: Record<PipelinePhase, string> = {
  frames:     '提取視頻幀 + 音頻',
  audio:      '提取視頻幀 + 音頻',
  transcribe: '語音識別',
  report:     '生成報告',
  done:       '完成',
};

// Displayed as 3 steps (frames+audio merged, transcribe, report)
const PHASE_ORDER: PipelinePhase[] = ['frames', 'transcribe', 'report'];

// ─── Component ────────────────────────────────────────────────────────────────

interface VideoUploadPageProps {
  config: ModeConfig;
  onBack: () => void;
}

type UploadState = 'idle' | 'analysing' | 'done';

export function VideoUploadPage({ config, onBack }: VideoUploadPageProps) {
  const workerRef   = useRef<Worker | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [state, setState]   = useState<UploadState>('idle');
  const [file, setFile]     = useState<File | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const [error, setError]   = useState<string | null>(null);

  // Prompt fields
  const [selectedPreset, setSelectedPreset] = useState<number>(0);
  const [inputText, setInputText]   = useState(PRESET_PROMPTS[0].input);
  const [outputText, setOutputText] = useState(PRESET_PROMPTS[0].output);
  const [speechLang, setSpeechLang] = useState(PRESET_PROMPTS[0].lang);

  // Progress
  const [phase, setPhase]         = useState<PipelinePhase>('frames');
  const [phaseLabel, setPhaseLabel] = useState('');
  const [phasePct, setPhasePct]   = useState(0);

  // Overall progress bar: 3 displayed steps (frames+audio, transcribe, report) = 33% each
  // Map 'audio' → same slot as 'frames' since they run in parallel
  const displayPhase: PipelinePhase = phase === 'audio' ? 'frames' : phase;
  const stepIdx = PHASE_ORDER.indexOf(displayPhase);
  const overallPct = stepIdx < 0 ? 100
    : Math.min(99, stepIdx * 33 + Math.round(phasePct * 0.33));

  const handlePresetClick = (index: number) => {
    setSelectedPreset(index);
    setInputText(PRESET_PROMPTS[index].input);
    setOutputText(PRESET_PROMPTS[index].output);
    setSpeechLang(PRESET_PROMPTS[index].lang);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setReport(null);
    setError(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0] ?? null;
    if (f) { setFile(f); setReport(null); setError(null); }
  };

  const handleAnalyse = useCallback(async () => {
    if (!file) return;
    setError(null);
    setReport(null);
    setState('analysing');
    setPhasePct(0);
    setPhase('frames');

    // Create vision worker fresh for each analysis
    const VisionWorker = (await import('../workers/vision.worker?worker')).default;
    const worker = new VisionWorker();
    workerRef.current = worker;

    // Send init message and wait for 'ready' signal
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Vision worker init timeout (15s)')), 15000);
      worker.onmessage = (e) => {
        if (e.data?.type === 'ready') {
          clearTimeout(timeout);
          worker.onmessage = null;  // clear — VideoFrameExtractor uses addEventListener
          resolve();
        } else if (e.data?.type === 'error') {
          clearTimeout(timeout);
          worker.onmessage = null;
          reject(new Error(e.data.error));
        }
      };
      // Must explicitly trigger init — worker does not auto-initialise
      worker.postMessage({ type: 'init' });
    });

    try {
      const result = await runVideoAnalysisPipeline({
        file,
        config,
        extras: { input: inputText, output: outputText },
        speechLang,
        worker,
        onProgress: (p, pct, label) => {
          setPhase(p);
          setPhasePct(pct);
          setPhaseLabel(label);
        },
      });
      setReport(result.report);
      setState('done');
    } catch (err) {
      setError(`分析失敗: ${err}`);
      setState('idle');
    } finally {
      worker.terminate();
      workerRef.current = null;
    }
  }, [file, config, inputText, outputText, speechLang]);

  const isIdle = state === 'idle' || state === 'done';

  return (
    <div className="session-runner">
      {/* Header */}
      <div className="session-header">
        <button className="back-btn" onClick={onBack} disabled={state === 'analysing'}>
          ← 返回
        </button>
        <div className="session-title-row">
          <span className="session-icon">{config.icon}</span>
          <div>
            <h1 className="session-title">{config.title}</h1>
            <p className="session-subtitle">{config.subtitle}</p>
          </div>
        </div>
      </div>

      {/* Preset selector */}
      {isIdle && (
        <div className="video-preset-section">
          <p className="video-section-label">選擇分析場景</p>
          <div className="video-preset-row">
            {PRESET_PROMPTS.map((p, i) => (
              <button
                key={i}
                className={`variant-btn ${selectedPreset === i ? 'active' : ''}`}
                style={{ '--mode-color': config.color } as React.CSSProperties}
                onClick={() => handlePresetClick(i)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Prompt inputs */}
      <div className="config-inputs">
        <div className="video-field-group">
          <label className="video-field-label">📥 輸入背景（影片內容說明）</label>
          <textarea
            className="text-input textarea-input"
            placeholder="例如：幼稚園課堂，教學語言廣東話..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={!isIdle}
            rows={2}
          />
        </div>
        <div className="video-field-group">
          <label className="video-field-label">📤 輸出要求（分析重點）</label>
          <textarea
            className="text-input textarea-input"
            placeholder="例如：分析學生參與度、情緒及老師互動技巧..."
            value={outputText}
            onChange={(e) => setOutputText(e.target.value)}
            disabled={!isIdle}
            rows={2}
          />
        </div>

        {/* Language selector */}
        {isIdle && (
          <div className="video-field-group">
            <label className="video-field-label">🗣 語音語言</label>
            <select
              className="text-input video-lang-select"
              value={speechLang}
              onChange={(e) => setSpeechLang(e.target.value)}
            >
              <option value="zh-TW">廣東話 / 普通話（繁體）</option>
              <option value="zh-CN">普通話（簡體）</option>
              <option value="en-US">English (US)</option>
              <option value="en-GB">English (UK)</option>
              <option value="ja-JP">日本語</option>
            </select>
          </div>
        )}
      </div>

      {/* File drop zone */}
      {isIdle && (
        <div
          className={`video-drop-zone ${file ? 'has-file' : ''}`}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,.mp4,.mov,.webm,.mkv"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          {file ? (
            <div className="video-drop-info">
              <span className="video-drop-icon">🎬</span>
              <div>
                <p className="video-filename">{file.name}</p>
                <p className="video-filesize">{(file.size / (1024 * 1024)).toFixed(1)} MB · 點擊更換</p>
              </div>
            </div>
          ) : (
            <div className="video-drop-info">
              <span className="video-drop-icon">⬆️</span>
              <div>
                <p className="video-drop-title">拖放影片到此處</p>
                <p className="video-drop-hint">支援 MP4、MOV、WebM · 建議 5–15 分鐘</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Analyse button */}
      {isIdle && file && (
        <div className="controls-row">
          <button
            className="primary-btn"
            style={{ backgroundColor: config.color }}
            onClick={handleAnalyse}
          >
            🔍 開始分析
          </button>
          {state === 'done' && (
            <button
              className="secondary-btn"
              onClick={() => { setFile(null); setReport(null); setState('idle'); }}
            >
              重新上傳
            </button>
          )}
        </div>
      )}

      {/* Progress */}
      {state === 'analysing' && (
        <div className="video-progress-section">
          <div className="video-progress-header">
            <span className="video-progress-phase">{PHASE_LABEL[phase]}</span>
            <span className="video-progress-pct">{overallPct}%</span>
          </div>
          <div className="video-progress-bar-track">
            <div
              className="video-progress-bar-fill"
              style={{ width: `${overallPct}%`, backgroundColor: config.color }}
            />
          </div>
          <p className="video-progress-label">{phaseLabel}</p>

          {/* Phase steps — 3 displayed steps (frames+audio merged, transcribe, report) */}
          <div className="video-phase-steps">
            {PHASE_ORDER.map((p) => {
              const idx     = PHASE_ORDER.indexOf(p);
              const curIdx  = PHASE_ORDER.indexOf(displayPhase);
              const done    = idx < curIdx || (p === displayPhase && phasePct === 100);
              const active  = p === displayPhase && phasePct < 100;
              return (
                <div key={p} className={`video-phase-step ${done ? 'done' : ''} ${active ? 'active' : ''}`}>
                  <span className="video-phase-dot">{done ? '✓' : idx + 1}</span>
                  <span className="video-phase-name">{PHASE_LABEL[p]}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Error */}
      {error && <div className="error-box">{error}</div>}

      {/* Report */}
      <ReportView markdown={report} loading={state === 'analysing'} />
    </div>
  );
}
