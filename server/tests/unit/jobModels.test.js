import { describe, expect, it } from 'vitest';
import { JobRun } from '../../src/models/JobRun.js';
import { JobState } from '../../src/models/JobState.js';
import { errorsOf } from '../helpers/errorsOf.js';

const T0 = new Date('2026-10-20T06:00:00Z');
const T1 = new Date('2026-10-20T06:00:02Z');

describe('JobState', () => {
  const base = {
    name: 'lot-maintenance',
    lastStartedAt: T0,
    lastFinishedAt: T1,
    lastStatus: 'succeeded',
  };

  it('accepts a valid state, with no claim held by default', async () => {
    const state = new JobState(base);
    expect(await errorsOf(state)).toEqual({});
    expect(state.lockedBy).toBeNull();
    expect(state.lockedUntil).toBeNull();
  });

  it('rejects bad names and unknown statuses', async () => {
    for (const name of ['Lot Maintenance', '1abc', '', 'a_b']) {
      expect(await errorsOf(new JobState({ ...base, name }))).toHaveProperty('name');
    }
    expect(await errorsOf(new JobState({ ...base, lastStatus: 'lost' }))).toHaveProperty(
      'lastStatus',
    );
  });

  it('rejects a run that finished before it started', async () => {
    expect(
      await errorsOf(new JobState({ ...base, lastFinishedAt: T0, lastStartedAt: T1 })),
    ).toHaveProperty('lastFinishedAt');
  });

  it('keeps errors short, durations positive and names unique', async () => {
    expect(await errorsOf(new JobState({ ...base, lastError: 'x'.repeat(301) }))).toHaveProperty(
      'lastError',
    );
    expect(await errorsOf(new JobState({ ...base, lastDurationMs: -1 }))).toHaveProperty(
      'lastDurationMs',
    );
    expect(JobState.schema.path('name').options.unique).toBe(true);
  });
});

describe('JobRun', () => {
  const base = {
    name: 'lot-maintenance',
    instance: 'host-1',
    startedAt: T0,
    finishedAt: T1,
    durationMs: 2000,
    status: 'succeeded',
    summary: { expired: 2 },
  };

  it('accepts a valid run', async () => {
    expect(await errorsOf(new JobRun(base))).toEqual({});
  });

  it('requires the key fields and a known status', async () => {
    const errors = await errorsOf(new JobRun({}));
    expect(Object.keys(errors)).toEqual(
      expect.arrayContaining([
        'name',
        'instance',
        'startedAt',
        'finishedAt',
        'durationMs',
        'status',
      ]),
    );
    expect(await errorsOf(new JobRun({ ...base, status: 'lost' }))).toHaveProperty('status');
    expect(await errorsOf(new JobRun({ ...base, durationMs: -1 }))).toHaveProperty('durationMs');
  });

  it('expires runs after 30 days', () => {
    const ttl = JobRun.schema
      .indexes()
      .find(([fields]) => Object.keys(fields).length === 1 && fields.startedAt === 1);
    expect(ttl[1].expireAfterSeconds).toBe(30 * 24 * 60 * 60);
  });

  it('hides mongo internals in JSON', () => {
    const json = new JobRun(base).toJSON();
    expect(json._id).toBeUndefined();
    expect(json.__v).toBeUndefined();
    expect(json.summary).toEqual({ expired: 2 });
  });
});
