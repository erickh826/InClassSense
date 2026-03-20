import type { SessionPayload } from '../modules/engagement/types';
import type { ModeConfig } from '../config/types';

/**
 * Resolves the system prompt for a given config + active variant key.
 */
function resolveSystemPrompt(config: ModeConfig, variantKey?: string): string {
  if (config.variants && config.variants.length > 0) {
    const variant = config.variants.find((v) => v.key === variantKey) ?? config.variants[0];
    return variant!.systemPrompt;
  }
  return config.defaultSystemPrompt ?? '';
}

/**
 * Calls the LLM endpoint (proxied via Vercel serverless function at /api/chat)
 * using the mode config to build the prompt.
 */
export async function generateReport(
  payload: SessionPayload,
  config: ModeConfig,
  extras: Record<string, string> = {},
  variantKey?: string,
): Promise<string> {
  const systemPrompt = resolveSystemPrompt(config, variantKey);
  const userPrompt = config.buildUserPrompt(payload, extras);

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
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
