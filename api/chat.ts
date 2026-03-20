import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Vercel serverless function — proxies chat completion requests to Azure OpenAI.
 * The API key is read server-side from environment variables and NEVER sent to the browser.
 *
 * Environment variables (set in Vercel project settings, NO VITE_ prefix):
 *   LLM_API_URL        e.g. https://myresource.openai.azure.com
 *   LLM_API_KEY        Azure OpenAI API key
 *   LLM_DEPLOYMENT     e.g. gpt-4o
 *   LLM_API_VERSION    e.g. 2024-12-01-preview
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiUrl = process.env.LLM_API_URL;
  const apiKey = process.env.LLM_API_KEY;
  const deployment = process.env.LLM_DEPLOYMENT || 'gpt-4o';
  const apiVersion = process.env.LLM_API_VERSION || '2024-12-01-preview';

  if (!apiUrl || !apiKey) {
    return res.status(500).json({ error: 'LLM environment variables not configured' });
  }

  const endpoint = `${apiUrl}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;

  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify(req.body),
    });

    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(502).json({ error: `Upstream request failed: ${err}` });
  }
}
