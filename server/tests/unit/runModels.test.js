import { describe, expect, it } from 'vitest';
import { canTransition } from '../../src/constants/orders.js';
import { RiderProfile } from '../../src/models/RiderProfile.js';
import { Run } from '../../src/models/Run.js';
import { describeRun } from '../../src/services/dispatch/describeRun.js';
import { errorsOf } from '../helpers/errorsOf.js';

const riderId = '65f1c2a4b9d3e8a1c4f7b001';
const stop = (orderCode, overrides) => ({
  orderCode,
  zoneCode: 'dhaka-mirpur',
  weightKg: 6,
  ...overrides,
});
const runBase = {
  code: 'RUN-ABCD2345',
  rider: riderId,
  cityCode: 'dhaka',
  depotCode: 'dhaka-depot',
  trip: 1,
  stops: [stop('ORD-AAAAAAAA'), stop('ORD-BBBBBBBB')],
  weightKg: 12,
  distanceKm: 8.4,
  offZoneStops: 0,
};

describe('RiderProfile', () => {
  const base = { user: riderId, cityCode: 'dhaka', vehicle: 'bike', zoneCodes: ['dhaka-mirpur'] };

  it('accepts a valid profile, starting off duty', async () => {
    const profile = new RiderProfile(base);
    expect(await errorsOf(profile)).toEqual({});
    expect(profile.onDuty).toBe(false);
  });

  it('rejects zones of another city, repeated zones and unknown vehicles', async () => {
    const other = { ...base, zoneCodes: ['chattogram-gec'] };
    expect(await errorsOf(new RiderProfile(other))).toHaveProperty('zoneCodes');
    const twice = { ...base, zoneCodes: ['dhaka-mirpur', 'dhaka-mirpur'] };
    expect(await errorsOf(new RiderProfile(twice))).toHaveProperty('zoneCodes');
    expect(await errorsOf(new RiderProfile({ ...base, vehicle: 'jet' }))).toHaveProperty('vehicle');
  });

  it('allows one profile per rider', () => {
    expect(RiderProfile.schema.path('user').options.unique).toBe(true);
  });
});

describe('Run', () => {
  it('accepts a valid run, planned with pending stops', async () => {
    const run = new Run(runBase);
    expect(await errorsOf(run)).toEqual({});
    expect(run.status).toBe('planned');
    expect(run.stops.every((s) => s.status === 'pending')).toBe(true);
  });

  it('needs at least one stop and no repeated orders', async () => {
    expect(await errorsOf(new Run({ ...runBase, stops: [] }))).toHaveProperty('stops');
    const twice = { ...runBase, stops: [stop('ORD-AAAAAAAA'), stop('ORD-AAAAAAAA')] };
    expect(await errorsOf(new Run(twice))).toHaveProperty('stops');
  });

  it('rejects bad codes and unknown statuses', async () => {
    expect(await errorsOf(new Run({ ...runBase, code: 'RUN-bad' }))).toHaveProperty('code');
    const badStop = { ...runBase, stops: [stop('ORD-bad')] };
    expect(Object.keys(await errorsOf(new Run(badStop))).join()).toContain('orderCode');
    expect(await errorsOf(new Run({ ...runBase, status: 'lost' }))).toHaveProperty('status');
    const badStopStatus = { ...runBase, stops: [stop('ORD-AAAAAAAA', { status: 'lost' })] };
    expect(Object.keys(await errorsOf(new Run(badStopStatus))).join()).toContain('status');
  });

  it('needs times for a run in progress or completed', async () => {
    const started = { ...runBase, status: 'in_progress' };
    expect(await errorsOf(new Run(started))).toHaveProperty('startedAt');
    expect(await errorsOf(new Run({ ...started, startedAt: new Date() }))).toEqual({});
    const done = { ...runBase, status: 'completed' };
    expect(await errorsOf(new Run(done))).toHaveProperty('completedAt');
    expect(await errorsOf(new Run({ ...done, completedAt: new Date() }))).toEqual({});
  });

  it('lets a rider have only one run in progress', () => {
    const index = Run.schema
      .indexes()
      .find(([fields]) => fields.rider === 1 && Object.keys(fields).length === 1);
    expect(index[1]).toMatchObject({
      unique: true,
      partialFilterExpression: { status: 'in_progress' },
    });
  });
});

describe('order status changes for deliveries', () => {
  it('lets a failed delivery send an order back, but nothing leave delivered', () => {
    expect(canTransition('placed', 'out_for_delivery')).toBe(true);
    expect(canTransition('out_for_delivery', 'placed')).toBe(true);
    expect(canTransition('out_for_delivery', 'cancelled')).toBe(false);
    expect(canTransition('delivered', 'placed')).toBe(false);
  });
});

describe('describeRun', () => {
  const orders = new Map([
    [
      'ORD-AAAAAAAA',
      {
        status: 'out_for_delivery',
        recipientName: 'Rahim Uddin',
        phone: '+8801712345678',
        address: { line: 'House 12, Road 3' },
        paymentMethod: 'cod',
        paymentStatus: 'unpaid',
        totalBdt: 376,
      },
    ],
    [
      'ORD-BBBBBBBB',
      {
        status: 'out_for_delivery',
        recipientName: 'Karim Mia',
        phone: '+8801812345678',
        address: { line: 'Flat 4B' },
        paymentMethod: 'wallet',
        paymentStatus: 'paid',
        totalBdt: 200,
      },
    ],
  ]);

  it('shows where to go and how much cash to collect', () => {
    const view = describeRun(new Run(runBase), orders);
    expect(view.stops[0]).toMatchObject({
      sequence: 1,
      orderCode: 'ORD-AAAAAAAA',
      recipientName: 'Rahim Uddin',
      phone: '+8801712345678',
      collectBdt: 376,
      orderStatus: 'out_for_delivery',
    });
    expect(view.stops[1]).toMatchObject({ sequence: 2, collectBdt: 0 });
  });

  it('never includes a delivery code, and copes with unknown orders', () => {
    const view = describeRun(new Run(runBase), orders);
    expect(JSON.stringify(view)).not.toMatch(/otp/i);
    const bare = describeRun(new Run(runBase));
    expect(bare.stops[0].collectBdt).toBe(0);
    expect(bare.stops[0].recipientName).toBeUndefined();
  });
});
