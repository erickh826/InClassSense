import React, { useRef, useState, useCallback } from 'react';
import { EngagementTracker } from '../modules/engagement/EngagementTracker';
import { generateReport } from '../api/reportGenerator';
import { PrivacyBadge } from './PrivacyBadge';
import { ReportView } from './ReportView';
import type { Utterance, EngagementFrame, SessionPayload } from '../modules/engagement/types';

type SessionState = 'idle' | 'running' | 'generating' | 'done';

export function SessionPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackerRef = useRef<EngagementTracker | null>(null);

  const [state, setState] = useState<SessionState>('idle');
  const [transcript, setTranscript] = useState<Utterance[]>([]);
  const [interim, setInterim] = useState('');
  const [latestFrame, setLatestFrame] = useState<EngagementFrame | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [topic, setTopic] = useState('');

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
    });

    trackerRef.current = tracker;

    try {
      await tracker.start(videoRef.current);
      setState('running');
    } catch (err) {
      setError(`啟動失敗: ${err}`);
    }
  }, []);

  const handleStop = useCallback(async () => {
    const tracker = trackerRef.current;
    if (!tracker) return;

    const sessionTopic = topic.trim() || '未命名課程';
    const payload: SessionPayload = tracker.stop(sessionTopic);
    trackerRef.current = null;
    setInterim('');

    // Update transcript with synced emotions
    setTranscript(payload.multimodal_transcript);

    // Generate report
    setState('generating');
    try {
      const md = await generateReport(payload);
      setReport(md);
      setState('done');
    } catch (err) {
      setError(`報告生成失敗: ${err}`);
      setState('done');
    }
  }, [topic]);

  const cameraActive = state === 'running';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <h1 style={{ fontSize: '1.5rem' }}>🧒 多模態兒童發展觀察</h1>

      {/* Topic input */}
      <input
        type="text"
        placeholder="課程主題（例如：動物園探險）"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        disabled={state !== 'idle'}
        style={{
          padding: '8px 12px',
          borderRadius: '8px',
          border: '1px solid #ddd',
          fontSize: '14px',
        }}
      />

      {/* Controls */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        {state === 'idle' && (
          <button onClick={handleStart} style={btnStyle('#1976d2')}>
            ▶ 開始觀察
          </button>
        )}
        {state === 'running' && (
          <button onClick={handleStop} style={btnStyle('#d32f2f')}>
            ■ 結束觀察
          </button>
        )}
        <PrivacyBadge visible={cameraActive} />
      </div>

      {/* Camera + Transcript side by side */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        {/* Video */}
        <div style={{ flex: '1 1 320px' }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: '100%',
              borderRadius: '12px',
              backgroundColor: '#000',
              display: cameraActive ? 'block' : 'none',
            }}
          />
          {latestFrame && cameraActive && (
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              👁 注視螢幕: {latestFrame.is_looking_at_screen ? '是' : '否'} |
              😊 表情: {latestFrame.emotion}
            </div>
          )}
        </div>

        {/* Transcript */}
        <div
          style={{
            flex: '1 1 320px',
            maxHeight: '400px',
            overflowY: 'auto',
            backgroundColor: '#fff',
            borderRadius: '12px',
            padding: '1rem',
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          }}
        >
          <h3 style={{ marginBottom: '0.5rem' }}>📝 對話紀錄</h3>
          {transcript.map((u, i) => (
            <div key={i} style={{ marginBottom: '6px', fontSize: '14px' }}>
              <span style={{ color: u.speaker === 'AI' ? '#1976d2' : '#388e3c' }}>
                [{u.time}] {u.speaker}:
              </span>{' '}
              {u.text}
              {u.emotion_context && (
                <span style={{ color: '#888', fontSize: '12px' }}>
                  {' '}
                  ({u.emotion_context})
                </span>
              )}
            </div>
          ))}
          {interim && (
            <div style={{ color: '#aaa', fontSize: '13px', fontStyle: 'italic' }}>
              {interim}…
            </div>
          )}
          {transcript.length === 0 && !interim && (
            <div style={{ color: '#bbb' }}>等待語音輸入…</div>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            padding: '10px',
            backgroundColor: '#fdecea',
            color: '#b71c1c',
            borderRadius: '8px',
          }}
        >
          {error}
        </div>
      )}

      {/* Report */}
      <ReportView markdown={report} loading={state === 'generating'} />
    </div>
  );
}

function btnStyle(bg: string): React.CSSProperties {
  return {
    padding: '10px 20px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: bg,
    color: '#fff',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
  };
}
