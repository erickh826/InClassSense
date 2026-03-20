import { useState } from 'react';
import { LandingPage } from './pages/LandingPage';
import { SessionRunner } from './pages/SessionRunner';
import type { ModeConfig } from './config/types';

export default function App() {
  const [activeMode, setActiveMode] = useState<ModeConfig | null>(null);

  if (activeMode) {
    return (
      <SessionRunner
        config={activeMode}
        onBack={() => setActiveMode(null)}
      />
    );
  }

  return <LandingPage onSelect={(mode) => setActiveMode(mode)} />;
}
