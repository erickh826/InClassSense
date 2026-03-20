import type { ModeConfig } from '../config/types';
import { ALL_MODES } from '../config';

interface LandingPageProps {
  onSelect: (mode: ModeConfig) => void;
}

export function LandingPage({ onSelect }: LandingPageProps) {
  return (
    <div className="landing">
      <header className="landing-header">
        <div className="landing-logo">
          <svg viewBox="0 0 40 40" fill="none" aria-label="InClassSense" width="40" height="40">
            <circle cx="20" cy="20" r="18" fill="#1976d2" opacity="0.12" />
            <circle cx="20" cy="16" r="7" fill="#1976d2" />
            <path d="M8 34c0-6.627 5.373-12 12-12s12 5.373 12 12" stroke="#1976d2" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="30" cy="12" r="4" fill="#2e7d32" />
            <path d="M26 22c0-4.418 2.686-8 4-8" stroke="#2e7d32" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <h1 className="landing-title">InClassSense</h1>
        <p className="landing-tagline">多模態 AI 觀察與評估平台</p>
        <p className="landing-desc">
          選擇觀察模式，鏡頭與語音全程本地分析，影像不會離開您的設備。
        </p>
      </header>

      <div className="mode-grid">
        {ALL_MODES.map((mode) => (
          <button
            key={mode.id}
            className="mode-card"
            onClick={() => onSelect(mode)}
            style={{ '--mode-color': mode.color } as React.CSSProperties}
          >
            <span className="mode-icon">{mode.icon}</span>
            <div className="mode-card-body">
              <h2 className="mode-card-title">{mode.title}</h2>
              <p className="mode-card-subtitle">{mode.subtitle}</p>
              <p className="mode-card-desc">{mode.description}</p>
            </div>
            <span className="mode-card-arrow">→</span>
          </button>
        ))}
      </div>

      <footer className="landing-footer">
        <span>影像在設備端本地處理 · 不上傳伺服器</span>
      </footer>
    </div>
  );
}
