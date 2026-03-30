import type { ModeConfig } from './types';
import type { SessionPayload } from '../modules/engagement/types';

/**
 * Video Upload Analysis — 4th mode card on Landing Page.
 *
 * This mode does NOT use the live SessionRunner.
 * The router in App.tsx will redirect id='video-analysis' to <VideoUploadPage />.
 * buildUserPrompt is still required by the ModeConfig interface and is used
 * by VideoAnalysisPipeline when calling /api/chat.
 */
export const videoAnalysisConfig: ModeConfig = {
  id: 'video-analysis',
  icon: '🎬',
  title: '影片分析',
  subtitle: '上傳影片，AI 自動分析',
  description: '上傳教學或面試影片（5–15 分鐘），AI 提取畫面情緒、語音逐字稿並生成分析報告。',
  color: '#7c3aed',

  // Not used in video mode — transcription is handled by Azure Speech
  speechLang: 'zh-TW',
  topicPlaceholder: '影片背景描述',
  defaultFacingMode: 'user',

  defaultSystemPrompt: `
你是一位多模態教育分析專家。
根據以下的【視覺統計數據】與【語音逐字稿（含時間戳）】，
撰寫一份詳細的分析報告，使用 Markdown 格式。
  `.trim(),

  buildUserPrompt(payload: SessionPayload, extras: Record<string, string>): string {
    const inputContext = extras['input'] || '';
    const outputFocus  = extras['output'] || '';

    return `
【影片背景】
${inputContext}

【分析重點要求】
${outputFocus}

【視覺統計數據】
${JSON.stringify(payload.engagement_stats, null, 2)}

【語音逐字稿（含時間戳與情緒）】
${JSON.stringify(payload.multimodal_transcript, null, 2)}
    `.trim();
  },

  reportTitle: '影片分析報告',
};
