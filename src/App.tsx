import { VideoUploadPage } from './pages/VideoUploadPage';
import { videoAnalysisConfig } from './config';

// demoV2: Launch directly into 影片分析 — no landing page or mode selection
export default function App() {
  return (
    <VideoUploadPage
      config={videoAnalysisConfig}
      onBack={() => {}}
    />
  );
}
