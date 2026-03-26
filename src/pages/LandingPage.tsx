import type { ModeConfig } from '../config/types';
import { ALL_MODES } from '../config';

interface LandingPageProps {
  onSelect: (mode: ModeConfig) => void;
}

export function LandingPage({ onSelect }: LandingPageProps) {
  return (
    <div className="landing">
      <header className="landing-header">
        <h1 className="landing-title">InClassSense</h1>
        <p className="landing-tagline">多模態 AI 觀察與評估平台</p>
        <p className="landing-desc">選擇觀察模式，鏡頭與語音全程本地分析，影像不會離開您的設備。</p>
      </header>
      <hr className="landing-divider" />

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
