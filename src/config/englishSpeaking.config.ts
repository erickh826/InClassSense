import type { ModeConfig } from './types';
import type { SessionPayload } from '../modules/engagement/types';

export const englishSpeakingConfig: ModeConfig = {
  id: 'english-speaking',
  icon: '🗣️',
  title: '英語口語練習',
  subtitle: 'IELTS Speaking 評估',
  description: '針對 IELTS Speaking 的口語練習與評估，輸入題目後即時記錄回答，生成評分報告。',
  color: '#2e7d32',

  speechLang: 'en-US',
  topicPlaceholder: '練習主題（例如：Part 2 Cue Card Practice）',
  defaultFacingMode: 'user',

  extraFields: [
    {
      key: 'question',
      label: '題目',
      placeholder: '輸入 IELTS Speaking 題目（例如：Describe a place you enjoy visiting. You should say: where it is, how often you go there, what you do there, and explain why you enjoy visiting it.）',
      multiline: true,
    },
  ],

  defaultSystemPrompt: `
You are a certified IELTS examiner with expertise in the IELTS Speaking assessment criteria.
Evaluate the candidate's spoken response based on the four official IELTS Speaking marking criteria:
1. Fluency and Coherence
2. Lexical Resource
3. Grammatical Range and Accuracy
4. Pronunciation (inferred from hesitations, repetitions, and self-corrections in the transcript)

Also consider the non-verbal engagement data (attention rate, emotional state) as supplementary indicators of confidence and composure.

Format your report in Markdown with:
- An overall band score estimate (0–9, to 0.5 precision)
- A section for each of the four criteria with a band score and specific observations
- Specific examples quoted directly from the transcript
- Concrete improvement suggestions for the next practice session
  `.trim(),

  buildUserPrompt(payload: SessionPayload, extras: Record<string, string>): string {
    const question = extras['question'] ?? '（未提供題目）';
    return `
【題目】
${question}

【候選人回答紀錄（含當下表情與停頓）】
${JSON.stringify(payload.multimodal_transcript, null, 2)}

【非語言統計數據】
${JSON.stringify(payload.engagement_stats, null, 2)}

【答題時間】
${payload.session_info.duration_seconds} 秒
    `.trim();
  },

  reportTitle: 'IELTS Speaking 評估報告',
};
