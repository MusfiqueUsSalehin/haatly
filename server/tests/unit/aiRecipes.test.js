import { describe, expect, it, vi } from 'vitest';
import { createAiGateway } from '../../src/services/ai/gateway.js';
import { buildRecipeRequest } from '../../src/services/recipes/aiRecipes.js';

const produce = [
  { slug: 'tomato', nameEn: 'Tomato', nameBn: 'টমেটো', category: 'vegetable' },
  { slug: 'potato', nameEn: 'Potato', nameBn: 'আলু', category: 'vegetable' },
];
const recipe = (overrides) => ({
  title: 'Tomato potato curry',
  timeMinutes: 30,
  uses: ['tomato', 'potato'],
  extras: ['onion', 'oil'],
  steps: ['Cut the vegetables.', 'Cook everything together until soft.'],
  ...overrides,
});

function run(reply, language = 'en') {
  const provider = {
    model: 'test-model',
    complete: vi.fn().mockResolvedValue({ text: reply, inputTokens: 1, outputTokens: 1 }),
  };
  const store = { log: vi.fn().mockResolvedValue(), countModelCalls: vi.fn().mockResolvedValue(0) };
  const ai = createAiGateway({
    env: { AI_MAX_CALLS_PER_DAY: 10 },
    logger: { warn() {} },
    provider,
    store,
  });
  return ai.run(buildRecipeRequest({ produce, language }));
}
const reply = (...recipes) => JSON.stringify({ recipes });

describe('recipes through the gateway', () => {
  it('uses a good model answer', async () => {
    const out = await run(reply(recipe()));
    expect(out.source).toBe('model');
    expect(out.result).toEqual({ language: 'en', recipes: [recipe()] });
  });

  it('accepts JSON wrapped in a code fence', async () => {
    const out = await run(`\`\`\`json\n${reply(recipe())}\n\`\`\``);
    expect(out.source).toBe('model');
  });

  it('only lets a recipe use produce that is in the basket', async () => {
    const out = await run(
      reply(recipe({ uses: ['tomato', 'okra'] }), recipe({ title: 'Okra only', uses: ['okra'] })),
    );
    expect(out.result.recipes).toHaveLength(1);
    expect(out.result.recipes[0].uses).toEqual(['tomato']);
  });

  it('cleans text: no angle brackets, tidy spacing, no repeated uses', async () => {
    const out = await run(
      reply(
        recipe({
          title: '  Tomato <b>curry</b>\n\n ',
          uses: ['tomato', 'tomato'],
          steps: ['Cook\n  until   soft.', 'Serve <script>alert(1)</script> hot.'],
        }),
      ),
    );
    const [cleaned] = out.result.recipes;
    expect(JSON.stringify(cleaned)).not.toMatch(/[<>]/);
    expect(cleaned.steps[0]).toBe('Cook until soft.');
    expect(cleaned.uses).toEqual(['tomato']);
  });

  it('drops a recipe that contains a link and keeps the others', async () => {
    const out = await run(
      reply(
        recipe({ title: 'Bad one', steps: ['Watch https://evil.example/video', 'Then cook it.'] }),
        recipe({ title: 'Good one' }),
      ),
    );
    expect(out.result.recipes.map((r) => r.title)).toEqual(['Good one']);
    const www = await run(
      reply(recipe({ extras: ['visit www.example.com'] }), recipe({ title: 'Ok' })),
    );
    const tomatoPotatoCurryRecipe = www.result.recipes.find(
      (r) => r.title === 'Tomato potato curry',
    );
    expect(tomatoPotatoCurryRecipe.extras).toEqual(['onion', 'oil']);
  });

  it('keeps at most three recipes', async () => {
    const five = Array.from({ length: 5 }, (_, i) => recipe({ title: `Recipe ${i}` }));
    const out = await run(reply(...five));
    expect(out.result.recipes.map((r) => r.title)).toEqual(['Recipe 0', 'Recipe 1', 'Recipe 2']);
  });

  it('limits extras to eight and treats a missing list as empty', async () => {
    const many = Array.from({ length: 12 }, (_, i) => `item ${i}`);
    const out = await run(
      reply(recipe({ extras: many }), recipe({ title: 'No extras', extras: undefined })),
    );
    expect(out.result.recipes[0].extras).toHaveLength(8);
    expect(out.result.recipes[1].extras).toEqual([]);
  });

  it.each([
    ['a time written as text', { timeMinutes: '30' }],
    ['a time that is too short', { timeMinutes: 4 }],
    ['a time that is too long', { timeMinutes: 181 }],
    ['a fractional time', { timeMinutes: 30.5 }],
    ['only one step', { steps: ['Cook it.'] }],
    ['nine steps', { steps: Array.from({ length: 9 }, (_, i) => `Step ${i}`) }],
    ['an empty step', { steps: ['Cut.', '  '] }],
    ['a step that is not text', { steps: ['Cut.', 42] }],
    ['a title that is too long', { title: 'x'.repeat(81) }],
    ['a missing title', { title: undefined }],
    ['no produce used', { uses: [] }],
  ])('falls back to the built-in recipes for %s', async (_label, change) => {
    const out = await run(reply(recipe(change)));
    expect(out.source).toBe('rules');
    expect(out.fallbackReason).toBe('invalid_output');
    expect(out.result.recipes.length).toBeGreaterThanOrEqual(1);
  });

  it('falls back when the reply is not usable at all', async () => {
    for (const text of ['sorry, I cannot help', '{"recipes":"none"}', '{"recipes":[]}']) {
      const out = await run(text);
      expect(out).toMatchObject({ source: 'rules', fallbackReason: 'invalid_output' });
    }
  });
});

describe('buildRecipeRequest', () => {
  it('asks for the right language and only describes catalog produce', () => {
    const { model, feature } = buildRecipeRequest({ produce, language: 'bn' });
    expect(feature).toBe('recipes');
    expect(model.system).toContain('Bangla');
    expect(model.system).toContain('Never include links');
    expect(model.content).toBe(
      'Produce:\n- tomato: Tomato (টমেটো), vegetable\n- potato: Potato (আলু), vegetable',
    );
  });

  it('has rules that work without the model', () => {
    const { rules, input } = buildRecipeRequest({ produce, language: 'en' });
    expect(rules(input).recipes.length).toBeGreaterThanOrEqual(1);
  });
});
