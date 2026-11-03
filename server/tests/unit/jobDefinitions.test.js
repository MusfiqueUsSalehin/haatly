import { describe, expect, it } from 'vitest';
import { createJobs } from '../../src/jobs/definitions.js';
import { validateJobs } from '../../src/jobs/scheduler.js';
import { latestSlot, nextSlot } from '../../src/jobs/schedule.js';
import { parseEnv } from '../../src/config/env.js';

const jobs = createJobs();
const byName = Object.fromEntries(jobs.map((job) => [job.name, job]));

describe('job definitions', () => {
  it('are all valid, with unique names', () => {
    expect(() => validateJobs(jobs)).not.toThrow();
    expect(jobs.map((job) => job.name)).toEqual([
      'shelf-morning',
      'shelf-refresh',
      'lot-upkeep',
      'payment-upkeep',
      'earnings-backfill',
    ]);
  });

  it('rebuild the shelf at 05:30 Bangladesh time, and every 15 minutes through the day', () => {
    expect(byName['shelf-morning'].schedule).toEqual({ dailyAt: '05:30' });
    expect(byName['shelf-refresh'].schedule).toEqual({ everyMinutes: 15 });
  });

  it('look after lots hourly and payments every five minutes', () => {
    expect(byName['lot-upkeep'].schedule).toEqual({ everyMinutes: 60 });
    expect(byName['payment-upkeep'].schedule).toEqual({ everyMinutes: 5 });
  });

  it('give every job time to finish before the next slot of the same job', () => {
    for (const job of jobs) {
      const now = new Date('2026-10-20T06:07:00Z');
      const gap = nextSlot(job.schedule, now) - latestSlot(job.schedule, now);
      expect(job.timeoutMs).toBeLessThan(gap);
    }
  });

  it('are functions the scheduler can call', () => {
    for (const job of jobs) expect(typeof job.run).toBe('function');
  });

  it('accept a payment provider for refund retries', () => {
    expect(() => validateJobs(createJobs({ payments: { name: 'sandbox' } }))).not.toThrow();
  });
});

describe('ENABLE_SCHEDULER', () => {
  const base = {
    MONGODB_URI: 'mongodb://127.0.0.1:27017/haatly',
    JWT_SECRET: 'a-long-random-secret-for-tests-0123456789',
  };

  it('is on by default, and can be switched off', () => {
    expect(parseEnv(base).ENABLE_SCHEDULER).toBe(true);
    expect(parseEnv({ ...base, ENABLE_SCHEDULER: 'true' }).ENABLE_SCHEDULER).toBe(true);
    expect(parseEnv({ ...base, ENABLE_SCHEDULER: 'false' }).ENABLE_SCHEDULER).toBe(false);
  });

  it('rejects anything else, so a typo cannot silently turn jobs off', () => {
    for (const value of ['no', '0', 'FALSE', '']) {
      expect(() => parseEnv({ ...base, ENABLE_SCHEDULER: value })).toThrow(/ENABLE_SCHEDULER/);
    }
  });
});
