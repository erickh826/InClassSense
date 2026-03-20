import type { ModeConfig } from './types';
import type { SessionPayload } from '../modules/engagement/types';

export const childObservationConfig: ModeConfig = {
  id: 'child-observation',
  icon: '🧒',
  title: '幼兒發展觀察',
  subtitle: '多模態兒童發展觀察系統',
  description: '記錄幼兒的語言表達、情緒反應與專注度，生成給老師的發展觀察報告。',
  color: '#1976d2',

  speechLang: 'zh-TW',
  topicPlaceholder: '課程主題（例如：動物園探險）',
  defaultFacingMode: 'environment',

  defaultSystemPrompt: `
你是一位具備教育心理學背景的幼兒教育專家。
根據以下的【多模態對話紀錄】與【非語言統計數據】,
撰寫一份給老師的兒童發展觀察報告，使用 Markdown 格式，
嚴格包含以下三個段落：
1. 語言溝通能力評估（詞彙量、句型、理解力、表達流暢度）
2. 情緒投入度評估（專注度、表情時機、遇困難時的情緒反應）
3. 建議觀察重點（具體給老師的下次引導方向）
  `.trim(),

  buildUserPrompt(payload: SessionPayload, _extras: Record<string, string>): string {
    return `
【統計數據】
${JSON.stringify(payload.engagement_stats, null, 2)}

【多模態對話紀錄（含當下表情）】
${JSON.stringify(payload.multimodal_transcript, null, 2)}
    `.trim();
  },

  reportTitle: '兒童發展觀察報告',
};
