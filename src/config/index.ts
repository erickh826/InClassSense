import type { ModeConfig } from './types';
import { childObservationConfig } from './childObservation.config';
import { englishSpeakingConfig } from './englishSpeaking.config';
import { interviewConfig } from './interview.config';
import { videoAnalysisConfig } from './videoAnalysis.config';

export { childObservationConfig, englishSpeakingConfig, interviewConfig, videoAnalysisConfig };
export type { ModeConfig };

export const ALL_MODES: ModeConfig[] = [
  childObservationConfig,
  englishSpeakingConfig,
  interviewConfig,
  videoAnalysisConfig,
];
