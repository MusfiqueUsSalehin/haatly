import { describe, expect, it } from 'vitest';
import { AiLog } from '../../src/models/AiLog.js';
import { errorsOf } from '../helpers/errorsOf.js';

const base = { feature: 'triage', source: 'model', modelCalled: true, latencyMs: 820 };

describe('AiLog', () => {
  it('accepts a valid entry and defaults modelCalled to false', async () => {
    expect(await errorsOf(new AiLog(base))).toEqual({});
    expect(new AiLog({ feature: 'triage', source: 'rules' }).modelCalled).toBe(false);
  });

  it('requires a feature and a source', async () => {
    const errors = await errorsOf(new AiLog({}));
    expect(Object.keys(errors)).toEqual(expect.arrayContaining(['feature', 'source']));
  });

  it('rejects an unknown source or fallback reason', async () => {
    expect(await errorsOf(new AiLog({ ...base, source: 'magic' }))).toHaveProperty('source');
    const bad = new AiLog({ ...base, fallbackReason: 'bored' });
    expect(await errorsOf(bad)).toHaveProperty('fallbackReason');
  });

  it('rejects negative numbers', async () => {
    expect(await errorsOf(new AiLog({ ...base, latencyMs: -1 }))).toHaveProperty('latencyMs');
  });

  it('expires entries after 90 days', () => {
    const ttl = AiLog.schema
      .indexes()
      .find(([fields]) => Object.keys(fields).length === 1 && fields.createdAt === 1);
    expect(ttl[1].expireAfterSeconds).toBe(90 * 24 * 60 * 60);
  });
});
