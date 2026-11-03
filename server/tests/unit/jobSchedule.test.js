import { describe, expect, it } from 'vitest';
import { describeSchedule, latestSlot, nextSlot, parseSchedule } from '../../src/jobs/schedule.js';

const at = (iso) => new Date(iso);
const slot = (schedule, iso) => latestSlot(schedule, at(iso)).toISOString();

describe('parseSchedule', () => {
  it('accepts an interval and a daily time', () => {
    expect(parseSchedule({ everyMinutes: 5 })).toEqual({ kind: 'interval', everyMinutes: 5 });
    expect(parseSchedule({ dailyAt: '05:30' })).toMatchObject({
      kind: 'daily',
      hour: 5,
      minute: 30,
    });
    expect(parseSchedule({ dailyAt: '00:00' })).toMatchObject({ hour: 0, minute: 0 });
    expect(parseSchedule({ dailyAt: '23:59' })).toMatchObject({ hour: 23, minute: 59 });
  });

  it.each([
    ['zero minutes', { everyMinutes: 0 }],
    ['more than a day', { everyMinutes: 1441 }],
    ['a fraction', { everyMinutes: 2.5 }],
    ['text instead of a number', { everyMinutes: '5' }],
    ['hour 24', { dailyAt: '24:00' }],
    ['minute 60', { dailyAt: '05:60' }],
    ['no leading zero', { dailyAt: '5:30' }],
    ['not a time', { dailyAt: 'noon' }],
    ['a time that is not text', { dailyAt: 530 }],
    ['both fields', { everyMinutes: 5, dailyAt: '05:30' }],
    ['no fields', {}],
    ['an unknown field', { weekly: true }],
    ['nothing at all', null],
    ['text', 'every 5 minutes'],
  ])('rejects %s', (_label, schedule) => {
    expect(() => parseSchedule(schedule)).toThrow(RangeError);
  });
});

describe('latestSlot: intervals', () => {
  it('rounds down to the start of the current interval', () => {
    expect(slot({ everyMinutes: 5 }, '2026-10-20T06:07:30Z')).toBe('2026-10-20T06:05:00.000Z');
    expect(slot({ everyMinutes: 60 }, '2026-10-20T06:59:59Z')).toBe('2026-10-20T06:00:00.000Z');
    expect(slot({ everyMinutes: 1 }, '2026-10-20T06:07:30Z')).toBe('2026-10-20T06:07:00.000Z');
  });

  it('counts the exact start of a slot as that slot', () => {
    expect(slot({ everyMinutes: 15 }, '2026-10-20T06:15:00Z')).toBe('2026-10-20T06:15:00.000Z');
  });

  it('gives every server the same slot at the same moment', () => {
    const a = latestSlot({ everyMinutes: 5 }, at('2026-10-20T06:07:30.100Z'));
    const b = latestSlot({ everyMinutes: 5 }, at('2026-10-20T06:09:59.900Z'));
    expect(a.getTime()).toBe(b.getTime());
  });
});

describe('latestSlot: daily', () => {
  // 05:30 in Bangladesh is 23:30 UTC the evening before.
  it('uses today (Bangladesh time) once the time has passed', () => {
    expect(slot({ dailyAt: '05:30' }, '2026-10-20T06:00:00Z')).toBe('2026-10-19T23:30:00.000Z');
  });

  it('uses yesterday until the time comes round', () => {
    expect(slot({ dailyAt: '05:30' }, '2026-10-19T23:00:00Z')).toBe('2026-10-18T23:30:00.000Z');
  });

  it('counts the exact time as the slot', () => {
    expect(slot({ dailyAt: '05:30' }, '2026-10-19T23:30:00Z')).toBe('2026-10-19T23:30:00.000Z');
  });

  it('puts midnight in Bangladesh at 18:00 UTC', () => {
    expect(slot({ dailyAt: '00:00' }, '2026-10-20T06:00:00Z')).toBe('2026-10-19T18:00:00.000Z');
  });

  it('crosses a month end', () => {
    expect(slot({ dailyAt: '05:30' }, '2026-11-01T06:00:00Z')).toBe('2026-10-31T23:30:00.000Z');
  });
});

describe('nextSlot and describeSchedule', () => {
  it('is one interval or one day after the latest slot', () => {
    expect(nextSlot({ everyMinutes: 5 }, at('2026-10-20T06:07:30Z')).toISOString()).toBe(
      '2026-10-20T06:10:00.000Z',
    );
    expect(nextSlot({ dailyAt: '05:30' }, at('2026-10-20T06:00:00Z')).toISOString()).toBe(
      '2026-10-20T23:30:00.000Z',
    );
  });

  it('is always in the future', () => {
    const now = at('2026-10-20T06:15:00Z');
    expect(nextSlot({ everyMinutes: 15 }, now).getTime()).toBeGreaterThan(now.getTime());
  });

  it('describes schedules in words', () => {
    expect(describeSchedule({ everyMinutes: 1 })).toBe('every minute');
    expect(describeSchedule({ everyMinutes: 5 })).toBe('every 5 minutes');
    expect(describeSchedule({ dailyAt: '05:30' })).toBe('every day at 05:30 (Bangladesh time)');
  });
});
