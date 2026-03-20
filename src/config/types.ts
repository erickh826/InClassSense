import type { SessionPayload } from '../modules/engagement/types';

/**
 * A variant option for modes that have a sub-type toggle
 * (e.g. Interview: 幼稚園 vs 大學實習生)
 */
export interface ModeVariant {
  key: string;
  label: string;
  systemPrompt: string;
}

/**
 * Extra UI fields that a mode can request on top of the shared topic input.
 * Currently supports a freetext question input.
 */
export interface ExtraField {
  /** Internal key used to pass the value into buildUserPrompt */
  key: string;
  /** Placeholder text shown in the input */
  placeholder: string;
  /** Label shown above the input */
  label: string;
  /** If true, shown as a textarea instead of single-line input */
  multiline?: boolean;
}

/**
 * The complete configuration for one observation/assessment mode.
 * Bottom-layer modules (EngagementTracker, HeadPoseAnalyzer, etc.) are NOT
 * touched — only the prompt, labels, and extra UI differ between modes.
 */
export interface ModeConfig {
  /** Unique identifier, used as URL hash key */
  id: string;

  /** Landing page card info */
  icon: string;
  title: string;
  subtitle: string;
  description: string;
  color: string;       // CSS colour for card accent / button

  /** Speech recognition language */
  speechLang: string;

  /** Placeholder for the topic/title input shown in the session */
  topicPlaceholder: string;

  /** Optional extra fields shown before starting the session */
  extraFields?: ExtraField[];

  /**
   * If present, the mode shows a toggle to switch between variants.
   * Each variant carries its own systemPrompt.
   * If absent, use defaultSystemPrompt.
   */
  variants?: ModeVariant[];

  /**
   * Used when variants is undefined.
   * Use {{topic}} and {{extraFields.*}} as template variables.
   */
  defaultSystemPrompt?: string;

  /**
   * Builds the user-facing prompt from the session payload + extra context.
   * Shared across all variants of this mode.
   */
  buildUserPrompt: (
    payload: SessionPayload,
    extras: Record<string, string>,
  ) => string;

  /** Labels for the report output */
  reportTitle: string;

  /** Camera facing mode default for this use case */
  defaultFacingMode: 'user' | 'environment';
}
