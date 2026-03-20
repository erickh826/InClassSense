import type { ModeConfig } from './types';
import type { SessionPayload } from '../modules/engagement/types';

export const interviewConfig: ModeConfig = {
  id: 'interview',
  icon: '🎤',
  title: '面試評核',
  subtitle: '求職面試評估系統',
  description: '記錄面試者的語言表達、情緒與專注度，支援幼稚園入學面試及大學實習 Intern 面試兩種模式。',
  color: '#6a1b9a',

  speechLang: 'zh-TW',
  topicPlaceholder: '面試崗位 / 主題（例如：幼稚園 K1 入學、Software Engineer Intern）',
  defaultFacingMode: 'user',

  extraFields: [
    {
      key: 'question',
      label: '面試問題',
      placeholder: '輸入面試問題（例如：請介紹一下你自己，你喜歡做什麼？）',
      multiline: true,
    },
  ],

  variants: [
    {
      key: 'kindergarten',
      label: '👶 幼稚園入學',
      systemPrompt: `
你是一位有豐富經驗的幼稚園老師及入學評核專員。
根據以下的【面試問題】、【兒童回答紀錄】與【非語言統計數據】，
撰寫一份幼稚園入學面試評核報告，使用 Markdown 格式，包含以下段落：

1. **語言發展評估** — 詞彙量、句子結構、理解能力、廣東話／普通話流暢度
2. **社交情緒評估** — 與陌生人互動的自信度、情緒穩定性、眼神接觸與肢體語言
3. **學習準備度** — 專注力、跟隨指示的能力、好奇心與主動性
4. **整體建議** — 是否適合入學、需要特別關注的發展領域

評核語言請用繁體中文，語氣專業而溫暖。
      `.trim(),
    },
    {
      key: 'intern',
      label: '🎓 大學實習 Intern',
      systemPrompt: `
You are a senior HR manager and technical interviewer evaluating a university student for an internship position.
Based on the interview question, the candidate's responses, and the non-verbal engagement data below, write an intern candidate evaluation report in Markdown covering:

1. **Communication Skills** — clarity, structure, confidence, professional vocabulary
2. **Critical Thinking** — problem-solving approach, logical reasoning, examples provided
3. **Composure & Professionalism** — stress management (from engagement data), eye contact, composure under questioning
4. **Fit & Growth Potential** — alignment with role requirements, learning attitude, areas for development
5. **Hiring Recommendation** — Overall assessment (Strong Yes / Yes / Maybe / No) with brief justification

Be specific and cite examples from the transcript. Write in English.
      `.trim(),
    },
  ],

  buildUserPrompt(payload: SessionPayload, extras: Record<string, string>): string {
    const question = extras['question'] ?? '（未提供面試問題）';
    return `
【面試問題】
${question}

【面試者回答紀錄（含當下表情）】
${JSON.stringify(payload.multimodal_transcript, null, 2)}

【非語言統計數據（專注率、情緒變化）】
${JSON.stringify(payload.engagement_stats, null, 2)}

【面試時長】
${payload.session_info.duration_seconds} 秒
    `.trim();
  },

  reportTitle: '面試評核報告',
};
