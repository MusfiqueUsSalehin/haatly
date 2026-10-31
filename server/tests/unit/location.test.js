import { describe, expect, it } from 'vitest';
import { createRateGate, createWindowLimiter, parseLocation } from '../../src/realtime/location.js';

const NOW = new Date('2026-10-20T06:00:00Z');
const parse = (raw) => parseLocation(raw, NOW);

describe('parseLocation', () => {
  it('rounds coordinates and stamps the time itself', () => {
    expect(parse({ lat: 23.8223456789, lng: 90.3654321 })).toEqual({
      ok: true,
      location: { lat: 23.82235, lng: 90.36543, at: '2026-10-20T06:00:00.000Z' },
    });
  });

  it('keeps and tidies the optional fields', () => {
    const { location } = parse({
      lat: 23.8,
      lng: 90.4,
      accuracyM: 12.6,
      heading: 181.4,
      speedKmh: 12.345,
    });
    expect(location).toMatchObject({ accuracyM: 13, heading: 181, speedKmh: 12.3 });
  });

  it('ignores extra fields, including a client-supplied time', () => {
    const { location } = parse({ lat: 23.8, lng: 90.4, at: '1999-01-01', evil: 'x', riderId: 'y' });
    expect(Object.keys(location).sort()).toEqual(['at', 'lat', 'lng']);
    expect(location.at).toBe('2026-10-20T06:00:00.000Z');
  });

  it('accepts the edges of the Bangladesh box', () => {
    expect(parse({ lat: 20.5, lng: 88 }).ok).toBe(true);
    expect(parse({ lat: 26.7, lng: 92.8 }).ok).toBe(true);
  });

  it.each([
    ['outside Bangladesh', { lat: 0, lng: 0 }],
    ['swapped latitude and longitude', { lat: 90.4, lng: 23.8 }],
    ['just outside the box', { lat: 26.71, lng: 90 }],
    ['text coordinates', { lat: '23.8', lng: '90.4' }],
    ['not a number', { lat: Number.NaN, lng: 90.4 }],
    ['infinite', { lat: Infinity, lng: 90.4 }],
    ['a missing longitude', { lat: 23.8 }],
    ['negative accuracy', { lat: 23.8, lng: 90.4, accuracyM: -1 }],
    ['an impossible heading', { lat: 23.8, lng: 90.4, heading: 361 }],
    ['an impossible speed', { lat: 23.8, lng: 90.4, speedKmh: 200 }],
  ])('rejects %s', (_label, raw) => {
    expect(parse(raw)).toEqual({ ok: false });
  });

  it.each([undefined, null, 'hello', 42, [], [23.8, 90.4]])('rejects the message %s', (raw) => {
    expect(parse(raw)).toEqual({ ok: false });
  });
});

describe('createRateGate', () => {
  it('allows one event per interval', () => {
    let clock = 0;
    const gate = createRateGate({ minIntervalMs: 2000, now: () => clock });
    expect(gate.allow()).toBe(true);
    clock = 1999;
    expect(gate.allow()).toBe(false);
    clock = 2000;
    expect(gate.allow()).toBe(true);
  });

  it('does not let refused events push the window back', () => {
    let clock = 0;
    const gate = createRateGate({ minIntervalMs: 2000, now: () => clock });
    gate.allow();
    for (clock = 100; clock < 2000; clock += 100) expect(gate.allow()).toBe(false);
    clock = 2000;
    expect(gate.allow()).toBe(true);
  });
});

describe('createWindowLimiter', () => {
  it('allows a burst up to the maximum, then refuses until the window passes', () => {
    let clock = 0;
    const limiter = createWindowLimiter({ max: 3, windowMs: 1000, now: () => clock });
    expect([limiter.allow(), limiter.allow(), limiter.allow()]).toEqual([true, true, true]);
    expect(limiter.allow()).toBe(false);
    clock = 999;
    expect(limiter.allow()).toBe(false);
    clock = 1000;
    expect(limiter.allow()).toBe(true);
  });
});
