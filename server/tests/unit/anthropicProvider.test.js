import { describe, expect, it, vi } from 'vitest';
import { createAnthropicProvider } from '../../src/services/ai/anthropicProvider.js';

const respond = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const make = (fetchImpl) =>
  createAnthropicProvider({ apiKey: 'sk-secret-key', model: 'm-1', timeoutMs: 5000, fetchImpl });

describe('anthropic provider', () => {
  it('sends the request the Messages API expects', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(respond({ content: [], usage: {} }));
    await make(fetchImpl).complete({ system: 'be brief', content: 'hi', maxTokens: 100 });

    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(options.method).toBe('POST');
    expect(options.headers['x-api-key']).toBe('sk-secret-key');
    expect(options.headers['anthropic-version']).toBe('2023-06-01');
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(options.body)).toEqual({
      model: 'm-1',
      max_tokens: 100,
      system: 'be brief',
      messages: [{ role: 'user', content: 'hi' }],
    });
  });

  it('joins the text blocks and reports token usage', async () => {
    const body = {
      content: [{ type: 'text', text: 'a' }, { type: 'tool_use' }, { type: 'text', text: 'b' }],
      usage: { input_tokens: 30, output_tokens: 9 },
    };
    const out = await make(vi.fn().mockResolvedValue(respond(body))).complete({ content: 'x' });
    expect(out).toEqual({ text: 'ab', inputTokens: 30, outputTokens: 9 });
  });

  it('throws on an HTTP error without leaking the key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(respond({ error: 'sk-secret-key rejected' }, 401));
    const promise = make(fetchImpl).complete({ content: 'x' });
    await expect(promise).rejects.toThrow('status 401');
    await expect(promise).rejects.not.toThrow(/sk-secret-key/);
  });

  it('copes with a reply that has no content or usage', async () => {
    const out = await make(vi.fn().mockResolvedValue(respond({}))).complete({ content: 'x' });
    expect(out).toEqual({ text: '', inputTokens: 0, outputTokens: 0 });
  });
});
