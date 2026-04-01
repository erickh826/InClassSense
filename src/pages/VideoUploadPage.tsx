import { useRef, useState, useCallback } from 'react';
import { ReportView } from '../components/ReportView';
import { runVideoAnalysisPipeline, PipelinePhase } from '../modules/video/VideoAnalysisPipeline';
import { runGeminiAnalysis } from '../modules/video/GeminiAnalyser';
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
    label: '語言練習評估',
    input: 'IELTS Speaking test practice, candidate responding in English',
    output: 'Evaluate fluency, vocabulary range, grammar accuracy, coherence, and pronunciation. Provide band score estimate and improvement tips.',
    lang: 'en-US',
  },

];

// ─── Progress display (local file tab) ───────────────────────────────────────
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

// ─── Types ────────────────────────────────────────────────────────────────────

type TabType = 'local' | 'youtube';
type UploadState = 'idle' | 'analysing' | 'done';

interface VideoUploadPageProps {
  config: ModeConfig;
  onBack: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function VideoUploadPage({ config, onBack }: VideoUploadPageProps) {
  // ── Tab ──────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabType>('local');

  // ── Shared state ─────────────────────────────────────────────────────────
  const [state, setState]   = useState<UploadState>('idle');
  const [report, setReport] = useState<string | null>(null);
  const [error, setError]   = useState<string | null>(null);

  // Prompt fields (shared by both tabs)
  const [selectedPreset, setSelectedPreset] = useState<number>(0);
  const [inputText, setInputText]   = useState(PRESET_PROMPTS[0].input);
  const [outputText, setOutputText] = useState(PRESET_PROMPTS[0].output);
  const [speechLang, setSpeechLang] = useState(PRESET_PROMPTS[0].lang);

  // ── Local file tab state ──────────────────────────────────────────────────
  const workerRef    = useRef<Worker | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);

  // Progress
  const [phase, setPhase]         = useState<PipelinePhase>('frames');
  const [phaseLabel, setPhaseLabel] = useState('');
  const [phasePct, setPhasePct]   = useState(0);

  // Overall progress bar: 3 displayed steps (frames+audio, transcribe, report) = 33% each
  const displayPhase: PipelinePhase = phase === 'audio' ? 'frames' : phase;
  const stepIdx = PHASE_ORDER.indexOf(displayPhase);
  const overallPct = stepIdx < 0 ? 100
    : Math.min(99, stepIdx * 33 + Math.round(phasePct * 0.33));

  // ── YouTube tab state ─────────────────────────────────────────────────────
  const [youtubeUrl, setYoutubeUrl] = useState('');

  // ─── Shared helpers ───────────────────────────────────────────────────────

  const handlePresetClick = (index: number) => {
    setSelectedPreset(index);
    setInputText(PRESET_PROMPTS[index].input);
    setOutputText(PRESET_PROMPTS[index].output);
    setSpeechLang(PRESET_PROMPTS[index].lang);
  };

  const handleTabSwitch = (tab: TabType) => {
    if (state === 'analysing') return;
    setActiveTab(tab);
    setReport(null);
    setError(null);
    setState('idle');
  };

  const isIdle = state === 'idle' || state === 'done';

  // ─── Local file handlers ──────────────────────────────────────────────────

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

  const handleLocalAnalyse = useCallback(async () => {
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

  // ─── YouTube analyse handler ──────────────────────────────────────────────

  const handleYoutubeAnalyse = useCallback(async () => {
    if (!youtubeUrl.trim()) return;
    setError(null);
    setReport(null);
    setState('analysing');

    try {
      const result = await runGeminiAnalysis({
        youtubeUrl: youtubeUrl.trim(),
        inputContext: inputText,
        outputFocus: outputText,
      });
      setReport(result.report);
      setState('done');
    } catch (err) {
      setError(`分析失敗: ${err}`);
      setState('idle');
    }
  }, [youtubeUrl, inputText, outputText]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="session-runner">
      {/* Header */}
      <div className="session-header">
        <div className="session-title-row">
          <span className="session-icon">{config.icon}</span>
          <div>
            <h1 className="session-title">{config.title}</h1>
            <p className="session-subtitle">{config.subtitle}</p>
          </div>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="video-tab-switcher">
        <button
          className={`video-tab-btn ${activeTab === 'local' ? 'active' : ''}`}
          style={activeTab === 'local' ? { '--tab-color': config.color } as React.CSSProperties : undefined}
          onClick={() => handleTabSwitch('local')}
          disabled={state === 'analysing'}
        >
          📁 本地上傳
        </button>
        <button
          className={`video-tab-btn ${activeTab === 'youtube' ? 'active' : ''}`}
          style={activeTab === 'youtube' ? { '--tab-color': config.color } as React.CSSProperties : undefined}
          onClick={() => handleTabSwitch('youtube')}
          disabled={state === 'analysing'}
        >
          🎬 YouTube
        </button>
      </div>

      {/* Preset selector (shared) */}
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

      {/* Prompt inputs (shared) */}
      <div className="config-inputs">
        <div className="video-field-group">
          <label className="video-field-label">📥 輸入背景（影片內容說明）</label>
          <textarea
            className="text-input textarea-input"
            placeholder="例如：中學課堂，教學語言廣東話..."
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

        {/* Language selector — local file tab only */}
        {activeTab === 'local' && isIdle && (
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

      {/* ── LOCAL FILE TAB ───────────────────────────────────────────────── */}
      {activeTab === 'local' && (
        <>
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
                onClick={handleLocalAnalyse}
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
        </>
      )}

      {/* ── YOUTUBE TAB ──────────────────────────────────────────────────── */}
      {activeTab === 'youtube' && (
        <>
          {/* Privacy notice */}
          {/* <div className="youtube-notice">
            <span className="youtube-notice-icon">ℹ️</span>
           {/* <span>影片分析由 Gemini AI 處理，影片內容會傳送至 Google 伺服器。本地上傳模式的影片數據只在瀏覽器內處理。</span>*/}
          </div> */}

          {/* URL input */}
          {isIdle && (
            <div className="video-field-group">
              <label className="video-field-label">🔗 YouTube 影片網址</label>
              <input
                type="url"
                className="text-input youtube-url-input"
                placeholder="https://www.youtube.com/watch?v=..."
                value={youtubeUrl}
                onChange={(e) => { setYoutubeUrl(e.target.value); setError(null); }}
              />
            </div>
          )}

          {/* Analyse button */}
          {isIdle && (
            <div className="controls-row">
              <button
                className="primary-btn"
                style={{ backgroundColor: config.color }}
                onClick={handleYoutubeAnalyse}
                disabled={!youtubeUrl.trim()}
              >
                🔍 開始分析
              </button>
              {state === 'done' && (
                <button
                  className="secondary-btn"
                  onClick={() => { setYoutubeUrl(''); setReport(null); setState('idle'); }}
                >
                  重新分析
                </button>
              )}
            </div>
          )}

          {/* Spinner */}
          {state === 'analysing' && (
            <div className="youtube-analysing">
              <div className="youtube-spinner" style={{ borderTopColor: config.color }} />
              <p className="youtube-analysing-label">Gemini 正在分析影片，請稍候…</p>
              <p className="youtube-analysing-hint">視乎影片長度，通常需要 30–120 秒</p>
            </div>
          )}
        </>
      )}

      {/* Error */}
      {error && <div className="error-box">{error}</div>}

      {/* Report */}
      <ReportView markdown={report} loading={state === 'analysing'} />
    </div>
  );
}
