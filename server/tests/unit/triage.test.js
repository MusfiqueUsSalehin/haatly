import { describe, expect, it, vi } from 'vitest';
import { createAiGateway } from '../../src/services/ai/gateway.js';
import { DEFECT_NAMES, assess, buildTriageRequest } from '../../src/services/ai/triage.js';

const potato = { slug: 'potato', nameEn: 'Potato', shelfLifeDays: 30 };
const tomato = { slug: 'tomato', nameEn: 'Tomato', shelfLifeDays: 5 };
const spinach = { slug: 'spinach', nameEn: 'Spinach', shelfLifeDays: 2 };
const photo = { mediaType: 'image/jpeg', data: 'AAAA' };

describe('assess (rules)', () => {
  it('grades a clean crate A with the full catalog shelf life', () => {
    expect(assess(potato, [])).toEqual({
      grade: 'A',
      sellable: true,
      shelfLifeDays: 30,
      defects: [],
      notes: ['no_defects'],
    });
  });

  it('treats cosmetic defects as grade A', () => {
    const out = assess(potato, ['misshapen', 'oversized']);
    expect(out).toMatchObject({ grade: 'A', shelfLifeDays: 30, notes: ['cosmetic_only'] });
  });

  it('grades one or two moderate defects B and shortens the shelf life', () => {
    expect(assess(potato, ['bruise', 'soft'])).toMatchObject({ grade: 'B', shelfLifeDays: 18 });
  });

  it('grades three or more moderate defects C', () => {
    const out = assess(potato, ['bruise', 'soft', 'wilted']);
    expect(out).toMatchObject({ grade: 'C', sellable: true, shelfLifeDays: 10 });
  });

  it.each(['rot', 'mould', 'slime'])('never sells a crate with %s', (defect) => {
    expect(assess(potato, [defect])).toEqual({
      grade: 'C',
      sellable: false,
      shelfLifeDays: 0,
      defects: [defect],
      notes: ['unsafe_defect'],
    });
  });

  it('lets one unsafe defect override everything else', () => {
    expect(assess(potato, ['misshapen', 'rot']).sellable).toBe(false);
  });

  it('never exceeds the catalog shelf life or drops below one day when sellable', () => {
    for (const produce of [potato, tomato, spinach]) {
      for (const tags of [[], ['bruise'], ['bruise', 'soft', 'wilted']]) {
        const { shelfLifeDays } = assess(produce, tags);
        expect(shelfLifeDays).toBeLessThanOrEqual(produce.shelfLifeDays);
        expect(shelfLifeDays).toBeGreaterThanOrEqual(1);
      }
    }
    expect(assess(spinach, ['bruise']).shelfLifeDays).toBe(1);
  });

  it('ignores unknown and repeated tags', () => {
    expect(assess(tomato, ['bruise', 'bruise', 'purple']).defects).toEqual(['bruise']);
  });
});

describe('buildTriageRequest', () => {
  it('does not involve the model when there is no photo', () => {
    const request = buildTriageRequest({ produce: tomato, defectTags: [] });
    expect(request.model).toBeUndefined();
    expect(request.rules(request.input)).toMatchObject({ grade: 'A', photoUsed: false });
  });

  it('sends the photo and the allowed defect list when there is one', () => {
    const { model } = buildTriageRequest({ produce: tomato, photo });
    expect(model.content[0]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' },
    });
    for (const name of DEFECT_NAMES) expect(model.system).toContain(name);
    expect(typeof model.clamp).toBe('function');
  });
});

describe('triage through the gateway', () => {
  function run({ defectTags = [], reply, produce = tomato }) {
    const provider = {
      model: 'test-model',
      complete: vi.fn().mockResolvedValue({ text: reply, inputTokens: 1, outputTokens: 1 }),
    };
    const store = {
      log: vi.fn().mockResolvedValue(),
      countModelCalls: vi.fn().mockResolvedValue(0),
    };
    const ai = createAiGateway({
      env: { AI_MAX_CALLS_PER_DAY: 10 },
      logger: { warn() {} },
      provider,
      store,
    });
    return ai.run(buildTriageRequest({ produce, defectTags, photo }));
  }

  it('lets the model add a defect it can see', async () => {
    const out = await run({ reply: '{"defects":["mould"]}' });
    expect(out.source).toBe('model');
    expect(out.result).toMatchObject({ sellable: false, photoUsed: true });
  });

  it('never lets the model remove a defect the farmer ticked', async () => {
    const out = await run({ defectTags: ['rot'], reply: '{"defects":[]}' });
    expect(out.result.sellable).toBe(false);
  });

  it('ignores any grade or shelf life the model tries to set', async () => {
    const reply = '{"grade":"A","shelfLifeDays":99,"sellable":true,"defects":["bruise"]}';
    const out = await run({ reply });
    expect(out.result).toMatchObject({ grade: 'B', shelfLifeDays: 3, sellable: true });
  });

  it('accepts JSON wrapped in a code fence', async () => {
    const out = await run({ reply: '```json\n{"defects":["bruise"]}\n```' });
    expect(out.source).toBe('model');
    expect(out.result).toMatchObject({ grade: 'B', photoUsed: true });
  });

  it('drops defect names it does not know', async () => {
    const out = await run({ reply: '{"defects":["purple","bruise"]}' });
    expect(out.result.defects).toEqual(['bruise']);
  });

  it('falls back to the rules when the reply is unusable', async () => {
    const out = await run({ defectTags: ['bruise'], reply: 'sorry, I cannot help' });
    expect(out).toMatchObject({ source: 'rules', fallbackReason: 'invalid_output' });
    expect(out.result).toMatchObject({ grade: 'B', photoUsed: false });
  });

  it('falls back when "defects" is not a list', async () => {
    const out = await run({ reply: '{"defects":"rot"}' });
    expect(out.fallbackReason).toBe('invalid_output');
  });
});
