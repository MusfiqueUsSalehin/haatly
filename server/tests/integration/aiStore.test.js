import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearTestDb, startTestDb, stopTestDb } from '../helpers/testDb.js';
import { AiLog } from '../../src/models/AiLog.js';
import { createAiStore } from '../../src/services/ai/store.js';

const DAY = 24 * 60 * 60 * 1000;
const store = createAiStore();

beforeAll(startTestDb);
afterAll(stopTestDb);
beforeEach(clearTestDb);

describe('ai store', () => {
  it('writes a log entry', async () => {
    await store.log({ feature: 'triage', source: 'rules', fallbackReason: 'provider_off' });
    const saved = await AiLog.findOne();
    expect(saved).toMatchObject({ feature: 'triage', source: 'rules', modelCalled: false });
    expect(saved.createdAt).toBeInstanceOf(Date);
  });

  it('counts only model calls from the last 24 hours', async () => {
    await store.log({ feature: 'triage', source: 'model', modelCalled: true });
    await store.log({ feature: 'triage', source: 'model', modelCalled: true });
    await store.log({ feature: 'triage', source: 'rules', fallbackReason: 'provider_off' });
    await AiLog.collection.insertOne({
      feature: 'triage',
      source: 'model',
      modelCalled: true,
      createdAt: new Date(Date.now() - 2 * DAY),
    });
    expect(await store.countModelCalls(new Date(Date.now() - DAY))).toBe(2);
  });

  it('counts a failed model call too, because it still costs money', async () => {
    await store.log({
      feature: 'triage',
      source: 'rules',
      modelCalled: true,
      fallbackReason: 'error',
    });
    expect(await store.countModelCalls(new Date(Date.now() - DAY))).toBe(1);
  });
});
