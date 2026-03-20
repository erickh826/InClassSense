import type { SessionPayload } from '../modules/engagement/types';

const SYSTEM_PROMPT = `
你是一位具備教育心理學背景的幼兒教育專家。
根據以下的【多模態對話紀錄】與【非語言統計數據】,
撰寫一份給老師的兒童發展觀察報告，使用 Markdown 格式，
嚴格包含以下三個段落：
1. 語言溝通能力評估（詞彙量、句型、理解力、表達流暢度）
2. 情緒投入度評估（專注度、表情時機、遇困難時的情緒反應）
3. 建議觀察重點（具體給老師的下次引導方向）
`.trim();

function buildUserPrompt(payload: SessionPayload): string {
  return `
【統計數據】
${JSON.stringify(payload.engagement_stats, null, 2)}

【多模態對話紀錄（含當下表情）】
${JSON.stringify(payload.multimodal_transcript, null, 2)}
`.trim();
}

/**
 * Calls the LLM endpoint (proxied through Vite dev server at /api)
 * to generate a teacher observation report in Markdown.
 */
export async function generateReport(payload: SessionPayload): Promise<string> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(payload) },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LLM request failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  const content: string | undefined = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('LLM returned empty response');
  }

  return content;
}
