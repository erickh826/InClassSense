import type { ModeConfig } from './types';
import { childObservationConfig } from './childObservation.config';
import { englishSpeakingConfig } from './englishSpeaking.config';
import { interviewConfig } from './interview.config';

export { childObservationConfig, englishSpeakingConfig, interviewConfig };
export type { ModeConfig };

export const ALL_MODES: ModeConfig[] = [
  childObservationConfig,
  englishSpeakingConfig,
  interviewConfig,
];
