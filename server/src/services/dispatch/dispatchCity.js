import { VEHICLES } from '../../constants/dispatch.js';
import { City } from '../../models/City.js';
import { Hub } from '../../models/Hub.js';
import { Order } from '../../models/Order.js';
import { RiderProfile } from '../../models/RiderProfile.js';
import { Run } from '../../models/Run.js';
import { User } from '../../models/User.js';
import { Zone } from '../../models/Zone.js';
import { AppError } from '../../utils/AppError.js';
import { randomCode } from '../../utils/ids.js';
import { planRuns } from '../routing/planRuns.js';
import { orderWeightKg } from './orderWeight.js';
import { announceRun } from '../../realtime/announce.js';

/**
 * Turn a planned trip into a saved run. The orders are claimed first with one atomic
 * update that only touches orders still waiting, so an order can never end up in two
 * runs, even when two dispatches run at the same moment. The run only lists the orders
 * this call actually claimed.
 */
async function createRun({ planned, cityCode, depotCode }) {
  const code = randomCode('RUN');
  await Order.updateMany(
    { code: { $in: planned.stops.map((s) => s.orderCode) }, status: 'placed', runCode: null },
    { $set: { runCode: code } },
  );
  const claimed = new Set(
    (await Order.find({ runCode: code }).select('code').lean()).map((order) => order.code),
  );
  const stops = planned.stops.filter((stop) => claimed.has(stop.orderCode));
  if (stops.length === 0) return null;

  let run;
  try {
    run = await Run.create({
      code,
      rider: planned.riderId,
      cityCode,
      depotCode,
      trip: planned.trip,
      stops,
      weightKg: Math.round(stops.reduce((sum, s) => sum + s.weightKg, 0) * 1000) / 1000,
      distanceKm: planned.distanceKm,
      offZoneStops: planned.offZoneStops,
    });
  } catch (err) {
    await Order.updateMany({ runCode: code }, { $set: { runCode: null } });
    throw err;
  }
  await announceRun(run, 'created');
  return run;
}

/**
 * Group a city's waiting orders into rider runs. Only cash orders and paid wallet orders
 * are eligible, only riders who are on duty (and approved) are used, and every order ends
 * up in a run or listed in `unassigned` with a reason. Safe to run repeatedly.
 */
export async function dispatchCity({ cityCode }) {
  const city = await City.findOne({ code: cityCode, active: true }).lean();
  if (!city) throw new AppError(404, 'city_not_found', 'City not found');
  const depot = await Hub.findOne({ kind: 'depot', cityCode, active: true }).lean();
  if (!depot) throw new AppError(409, 'no_depot', 'This city has no active depot');

  const [zones, profiles, orders] = await Promise.all([
    Zone.find({ cityCode, active: true }).lean(),
    RiderProfile.find({ cityCode, onDuty: true }).lean(),
    Order.find({
      cityCode,
      status: 'placed',
      runCode: null,
      $or: [{ paymentMethod: 'cod' }, { paymentStatus: 'paid' }],
    })
      .sort({ createdAt: 1 })
      .lean(),
  ]);

  const approved = await User.find({
    _id: { $in: profiles.map((p) => p.user) },
    role: 'rider',
    status: 'active',
  })
    .select('_id')
    .lean();
  const approvedIds = new Set(approved.map((user) => String(user._id)));
  const riders = profiles
    .filter((profile) => approvedIds.has(String(profile.user)))
    .map((profile) => ({
      id: String(profile.user),
      zoneCodes: profile.zoneCodes,
      capacityKg: VEHICLES[profile.vehicle].capacityKg,
      maxStops: VEHICLES[profile.vehicle].maxStops,
    }));

  const zoneCenters = Object.fromEntries(zones.map((zone) => [zone.code, zone.center]));
  const plannable = [];
  const unassigned = [];
  for (const order of orders) {
    const center = zoneCenters[order.zoneCode];
    if (!center) {
      unassigned.push({ orderCode: order.code, reason: 'unknown_zone' });
      continue;
    }
    plannable.push({
      code: order.code,
      zoneCode: order.zoneCode,
      lat: center.lat,
      lng: center.lng,
      weightKg: orderWeightKg(order),
    });
  }

  const plan = planRuns({ depot: depot.location, orders: plannable, riders, zoneCenters });
  unassigned.push(...plan.unassigned);

  const runs = [];
  for (const planned of plan.runs) {
    const run = await createRun({ planned, cityCode, depotCode: depot.code });
    if (run) runs.push(run);
  }
  return { runs, unassigned };
}
