const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

/**
 * Minimal Anthropic Messages API client (plain fetch, no SDK). `content` is a string,
 * or a list of content blocks when an image is included.
 * Errors carry only the HTTP status: never the response body or the API key.
 */
export function createAnthropicProvider({ apiKey, model, timeoutMs, fetchImpl = fetch }) {
  return {
    name: 'anthropic',
    model,
    async complete({ system, content, maxTokens }) {
      const response = await fetchImpl(API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': API_VERSION,
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: 'user', content }],
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        throw new Error(`anthropic request failed with status ${response.status}`);
      }
      const data = await response.json();
      const text = (data.content ?? [])
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('');
      return {
        text,
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
      };
    },
  };
}
