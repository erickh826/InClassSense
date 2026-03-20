import React, { useRef, useState, useCallback } from 'react';
import { EngagementTracker } from '../modules/engagement/EngagementTracker';
import { generateReport } from '../api/reportGenerator';
import { PrivacyBadge } from '../components/PrivacyBadge';
import { ReportView } from '../components/ReportView';
import type { Utterance, EngagementFrame, SessionPayload, EmotionTag } from '../modules/engagement/types';
import type { ModeConfig } from '../config/types';

interface SessionRunnerProps {
  config: ModeConfig;
  onBack: () => void;
}

type SessionState = 'idle' | 'running' | 'generating' | 'done';
type FacingMode = 'user' | 'environment';

const EMOTION_LABEL: Record<EmotionTag, string> = {
  happy:     '😊 開心',
  confused:  '😕 困惑',
  surprised: '😮 驚訝',
  neutral:   '😐 平靜',
  absent:    '👤 未偵測到臉部',
};

const EMOTION_LIVE_LABEL: Record<EmotionTag, string> = {
  happy:     '😊 開心',
  confused:  '😕 困惑',
  surprised: '😮 驚訝',
  neutral:   '😐 平靜',
  absent:    '👤 臉部未入鏡',
};

export function SessionRunner({ config, onBack }: SessionRunnerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackerRef = useRef<EngagementTracker | null>(null);

  const [state, setState] = useState<SessionState>('idle');
  const [transcript, setTranscript] = useState<Utterance[]>([]);
  const [interim, setInterim] = useState('');
  const [latestFrame, setLatestFrame] = useState<EngagementFrame | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [topic, setTopic] = useState('');
  const [facingMode, setFacingMode] = useState<FacingMode>(config.defaultFacingMode);

  // Extra fields (question input, etc.)
  const [extras, setExtras] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    config.extraFields?.forEach((f) => { init[f.key] = ''; });
    return init;
  });

  // Variant toggle (e.g. interview: kindergarten vs intern)
  const [activeVariant, setActiveVariant] = useState<string | undefined>(
    config.variants?.[0]?.key,
  );

  const handleStart = useCallback(async () => {
    if (!videoRef.current) return;
    setError(null);
    setReport(null);
    setTranscript([]);

    const tracker = new EngagementTracker({
      onUtterance: (u) => setTranscript((prev) => [...prev, u]),
      onInterim: (text) => setInterim(text),
      onFrame: (frame) => setLatestFrame(frame),
      onError: (err) => setError(err),
      facingMode,
    });

    trackerRef.current = tracker;

    try {
      await tracker.start(videoRef.current);
      setState('running');
    } catch (err) {
      setError(`啟動失敗: ${err}`);
    }
  }, [facingMode]);

  const handleStop = useCallback(async () => {
    const tracker = trackerRef.current;
    if (!tracker) return;

    const sessionTopic = topic.trim() || config.topicPlaceholder;
    const payload: SessionPayload = tracker.stop(sessionTopic);
    trackerRef.current = null;
    setInterim('');
    setTranscript(payload.multimodal_transcript);

    setState('generating');
    try {
      const md = await generateReport(payload, config, extras, activeVariant);
      setReport(md);
      setState('done');
    } catch (err) {
      setError(`報告生成失敗: ${err}`);
      setState('done');
    }
  }, [topic, config, extras, activeVariant]);

  const cameraActive = state === 'running';
  const isIdle = state === 'idle';

  return (
    <div className="session-runner">
      {/* Header */}
      <div className="session-header">
        <button className="back-btn" onClick={onBack} disabled={state === 'running' || state === 'generating'}>
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

      {/* Variant toggle (e.g. interview type) */}
      {config.variants && isIdle && (
        <div className="variant-toggle">
          {config.variants.map((v) => (
            <button
              key={v.key}
              className={`variant-btn ${activeVariant === v.key ? 'active' : ''}`}
              style={{ '--mode-color': config.color } as React.CSSProperties}
              onClick={() => setActiveVariant(v.key)}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}

      {/* Config inputs */}
      <div className="config-inputs">
        <input
          type="text"
          placeholder={config.topicPlaceholder}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          disabled={!isIdle}
          className="text-input"
        />
        {config.extraFields?.map((field) =>
          field.multiline ? (
            <textarea
              key={field.key}
              placeholder={field.placeholder}
              value={extras[field.key] ?? ''}
              onChange={(e) => setExtras((prev) => ({ ...prev, [field.key]: e.target.value }))}
              disabled={!isIdle}
              className="text-input textarea-input"
              rows={3}
            />
          ) : (
            <input
              key={field.key}
              type="text"
              placeholder={field.placeholder}
              value={extras[field.key] ?? ''}
              onChange={(e) => setExtras((prev) => ({ ...prev, [field.key]: e.target.value }))}
              disabled={!isIdle}
              className="text-input"
            />
          )
        )}
      </div>

      {/* Controls */}
      <div className="controls-row">
        {isIdle && (
          <>
            <button
              onClick={handleStart}
              className="primary-btn"
              style={{ backgroundColor: config.color }}
            >
              ▶ 開始
            </button>
            <button
              onClick={() => setFacingMode((m) => m === 'user' ? 'environment' : 'user')}
              className="secondary-btn"
              title={facingMode === 'user' ? '前置鏡頭（點擊切換後置）' : '後置鏡頭（點擊切換前置）'}
            >
              {facingMode === 'user' ? '🤳 前置' : '📷 後置'}
            </button>
          </>
        )}
        {state === 'running' && (
          <button onClick={handleStop} className="primary-btn" style={{ backgroundColor: '#d32f2f' }}>
            ■ 結束
          </button>
        )}
        <PrivacyBadge visible={cameraActive} />
      </div>

      {/* Camera + Transcript */}
      <div className="media-row">
        <div className="video-col">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="video-preview"
            style={{
              display: cameraActive ? 'block' : 'none',
              transform: facingMode === 'user' ? 'scaleX(-1)' : 'none',
            }}
          />
          {latestFrame && cameraActive && (
            <div className="frame-status">
              👁 注視螢幕: {latestFrame.is_looking_at_screen ? '是' : '否'} |{' '}
              {EMOTION_LIVE_LABEL[latestFrame.emotion]}
            </div>
          )}
        </div>

        <div className="transcript-col">
          <h3 className="transcript-heading">📝 對話紀錄</h3>
          {transcript.map((u, i) => (
            <div key={i} className="utterance">
              <span className={`speaker-tag ${u.speaker === 'AI' ? 'ai' : 'student'}`}>
                [{u.time}] {u.speaker}:
              </span>{' '}
              {u.text}
              {u.emotion_context && (
                <span className="emotion-tag">
                  {' '}({EMOTION_LABEL[u.emotion_context]})
                </span>
              )}
            </div>
          ))}
          {interim && <div className="interim-text">{interim}…</div>}
          {transcript.length === 0 && !interim && (
            <div className="empty-transcript">等待語音輸入…</div>
          )}
        </div>
      </div>

      {/* Error */}
      {error && <div className="error-box">{error}</div>}

      {/* Report */}
      <ReportView markdown={report} loading={state === 'generating'} />
    </div>
  );
}
