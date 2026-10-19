import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAiGateway } from '../../src/services/ai/gateway.js';

const env = { AI_MAX_CALLS_PER_DAY: 5 };
const rules = (n) => ({ value: n * 2 });

// The model may add at most 1 to what the rules said. Anything else is cut back.
const makeModel = (overrides = {}) => ({
  system: 'system prompt',
  content: 'user content',
  parse: (text) => JSON.parse(text),
  clamp: (parsed, rulesResult) => ({ value: Math.min(parsed.value, rulesResult.value + 1) }),
  ...overrides,
});

let logger;
let store;
let provider;

function gateway(overrides = {}) {
  return createAiGateway({ env, logger, provider, store, ...overrides });
}
const reply = (text) => ({ text, inputTokens: 12, outputTokens: 7 });

beforeEach(() => {
  logger = { warn: vi.fn() };
  store = { log: vi.fn().mockResolvedValue(), countModelCalls: vi.fn().mockResolvedValue(0) };
  provider = { model: 'test-model', complete: vi.fn() };
});

describe('ai gateway', () => {
  it('answers from the rules when there is no provider', async () => {
    const out = await gateway({ provider: null }).run({
      feature: 'demo',
      input: 2,
      rules,
      model: makeModel(),
    });
    expect(out).toEqual({ result: { value: 4 }, source: 'rules', fallbackReason: 'provider_off' });
    expect(provider.complete).not.toHaveBeenCalled();
    expect(store.log).toHaveBeenCalledWith(
      expect.objectContaining({ feature: 'demo', source: 'rules', fallbackReason: 'provider_off' }),
    );
  });

  it('uses the model answer and logs tokens and latency', async () => {
    provider.complete.mockResolvedValue(reply('{"value":5}'));
    const out = await gateway().run({ feature: 'demo', input: 2, rules, model: makeModel() });
    expect(out).toEqual({ result: { value: 5 }, source: 'model' });
    expect(provider.complete).toHaveBeenCalledWith({
      system: 'system prompt',
      content: 'user content',
      maxTokens: 600,
    });
    expect(store.log).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'model',
        modelCalled: true,
        model: 'test-model',
        inputTokens: 12,
        outputTokens: 7,
      }),
    );
  });

  it('clamps an unsafe model answer instead of trusting it', async () => {
    provider.complete.mockResolvedValue(reply('{"value":999}'));
    const out = await gateway().run({ feature: 'demo', input: 2, rules, model: makeModel() });
    expect(out.result).toEqual({ value: 5 });
    expect(out.source).toBe('model');
  });

  it('falls back to the rules when the provider fails', async () => {
    provider.complete.mockRejectedValue(new Error('anthropic request failed with status 500'));
    const out = await gateway().run({ feature: 'demo', input: 2, rules, model: makeModel() });
    expect(out).toMatchObject({ result: { value: 4 }, source: 'rules', fallbackReason: 'error' });
    expect(store.log).toHaveBeenCalledWith(
      expect.objectContaining({ modelCalled: true, error: expect.stringContaining('500') }),
    );
  });

  it('reports a timeout separately', async () => {
    provider.complete.mockRejectedValue(Object.assign(new Error('slow'), { name: 'TimeoutError' }));
    const out = await gateway().run({ feature: 'demo', input: 2, rules, model: makeModel() });
    expect(out.fallbackReason).toBe('timeout');
  });

  it('falls back when the reply is not valid', async () => {
    provider.complete.mockResolvedValue(reply('this is not json'));
    const out = await gateway().run({ feature: 'demo', input: 2, rules, model: makeModel() });
    expect(out).toMatchObject({ result: { value: 4 }, fallbackReason: 'invalid_output' });
    expect(store.log).toHaveBeenCalledWith(
      expect.objectContaining({ modelCalled: true, inputTokens: 12 }),
    );
  });

  it('falls back when the feature clamp rejects the reply', async () => {
    provider.complete.mockResolvedValue(reply('{"value":5}'));
    const model = makeModel({
      clamp: () => {
        throw new Error('unsafe');
      },
    });
    const out = await gateway().run({ feature: 'demo', input: 2, rules, model });
    expect(out.fallbackReason).toBe('invalid_output');
    expect(out.result).toEqual({ value: 4 });
  });

  it('stops calling the model once the daily budget is spent', async () => {
    store.countModelCalls.mockResolvedValue(5);
    const out = await gateway().run({ feature: 'demo', input: 2, rules, model: makeModel() });
    expect(out).toMatchObject({ source: 'rules', fallbackReason: 'budget' });
    expect(provider.complete).not.toHaveBeenCalled();
  });

  it('uses the rules when the budget cannot be checked', async () => {
    store.countModelCalls.mockRejectedValue(new Error('db down'));
    const out = await gateway().run({ feature: 'demo', input: 2, rules, model: makeModel() });
    expect(out).toMatchObject({ source: 'rules', fallbackReason: 'error' });
    expect(provider.complete).not.toHaveBeenCalled();
  });

  it('still answers when the log cannot be written', async () => {
    provider.complete.mockResolvedValue(reply('{"value":5}'));
    store.log.mockRejectedValue(new Error('db down'));
    const out = await gateway().run({ feature: 'demo', input: 2, rules, model: makeModel() });
    expect(out.result).toEqual({ value: 5 });
    expect(logger.warn).toHaveBeenCalled();
  });

  it('refuses a model definition without a clamp', async () => {
    const { clamp: _clamp, ...unsafe } = makeModel();
    await expect(
      gateway().run({ feature: 'demo', input: 2, rules, model: unsafe }),
    ).rejects.toThrow(/clamp/);
  });

  it('truncates long error messages before logging them', async () => {
    provider.complete.mockRejectedValue(new Error('x'.repeat(1000)));
    await gateway().run({ feature: 'demo', input: 2, rules, model: makeModel() });
    const entry = store.log.mock.calls[0][0];
    expect(entry.error).toHaveLength(300);
  });
});
