// server/tests/unit/impactNarrative.test.js
import { describe, expect, it } from 'vitest';
import { createAiGateway } from '../../src/services/ai/gateway.js';
import { fillNarrative, narrationWording } from '../../src/services/ai/impactNarrative.js';

const gateway = (provider) =>
  createAiGateway({
    env: { AI_MAX_CALLS_PER_DAY: 100 },
    logger: { warn() {} },
    provider,
    store: { log: async () => {}, countModelCalls: async () => 0 },
  });

const fake = (reply) => ({
  model: 'fake',
  complete: async () => ({ text: JSON.stringify(reply), inputTokens: 1, outputTokens: 1 }),
});

const GOOD = {
  bn: 'আপনার প্রতিটি অর্ডার কৃষকের মুখে হাসি ফোটায়, আর আপনি {kg} কেজি খাবার রক্ষা করেছেন।',
  en: 'Every order puts a smile on a farmer’s face, and you rescued {kg} kg of food.',
};
const figures = { orders: 3, kg: 12.34, co2: 5.5, saved: 420 };

describe('impact narrative', () => {
  it('uses the template when no provider is configured, and fills real numbers', async () => {
    const { texts, source } = await narrationWording(gateway(null));
    expect(source).toBe('rules');
    const filled = fillNarrative(texts, figures);
    expect(filled.en).toContain('3 orders');
    expect(filled.en).toContain('12.3 kg');
    expect(filled.en).not.toContain('{');
    expect(filled.bn).not.toContain('{');
  });

  it('accepts clean model wording and fills the numbers itself', async () => {
    const { texts, source } = await narrationWording(gateway(fake(GOOD)));
    expect(source).toBe('model');
    expect(fillNarrative(texts, figures).en).toContain('12.3 kg');
  });

  it.each([
    ['digits', { ...GOOD, en: 'You rescued 500 kg of food, which is wonderful for everyone.' }],
    ['a link', { ...GOOD, en: 'Visit www.example.com and rescued {kg} kg of food, thank you.' }],
    [
      'an unknown placeholder',
      { ...GOOD, en: 'Thank you {name}, you rescued {kg} kg of food with us.' },
    ],
    ['a short reply', { bn: 'ধন্যবাদ', en: 'Thanks' }],
  ])('falls back to the template for %s', async (_label, reply) => {
    const out = await narrationWording(gateway(fake(reply)));
    expect(out.source).toBe('rules');
    expect(out.fallbackReason).toBe('invalid_output');
  });
});
