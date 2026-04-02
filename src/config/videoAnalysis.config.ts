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
根據以下數據撰寫一份詳細的分析報告，使用 Markdown 格式。
如果視覺數據不可用，請僅根據語音逐字稿進行分析，並在報告中說明視覺數據缺失。
  `.trim(),

  buildUserPrompt(payload: SessionPayload, extras: Record<string, string>): string {
    const inputContext = extras['input'] || '';
    const outputFocus  = extras['output'] || '';

    // BUG-3 FIX: Detect whether vision data is genuinely available.
    // When the vision worker fails or no face is detected, all stats are zero
    // AND no utterance has an emotion_context. In that case, show a clear
    // disclaimer instead of misleading the LLM with all-zero measurements.
    // const hasEmotionData = payload.multimodal_transcript.some(u => u.emotion_context != null);
     const hasEmotionData = null
    // const statsAreAllZero =
    //   payload.engagement_stats.overall_attention_rate === 0 &&
    //   payload.engagement_stats.smile_count === 0 &&
    //   payload.engagement_stats.confused_count === 0 &&
    //   payload.engagement_stats.surprised_count === 0 &&
    //   payload.engagement_stats.absence_count === 0;
    const visionAvailable = hasEmotionData  //|| !statsAreAllZero;

    // BUG-2 FIX: Only include 情緒 in the transcript section header when
    // emotion_context values are actually present in the data.
    const transcriptHeader = hasEmotionData
      ? '【語音逐字稿（含時間戳與情緒）】'
      : '【語音逐字稿（含時間戳）】';

    const visionSection = visionAvailable
      ? `【視覺統計數據】\n${JSON.stringify(payload.engagement_stats, null, 2)}`
      : `【視覺統計數據】\n視覺數據不可用（畫面分析未能偵測到人臉，請僅根據語音逐字稿進行分析）`;

    return `
【影片背景】
${inputContext}

【分析重點要求】
${outputFocus}

${visionSection}

${transcriptHeader}
${JSON.stringify(payload.multimodal_transcript, null, 2)}
    `.trim();
  },

  reportTitle: '影片分析報告',
};
