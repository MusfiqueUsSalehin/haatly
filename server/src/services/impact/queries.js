import { IMPACT_FACTORS } from '../../constants/impact.js';
import { LedgerEntry } from '../../models/LedgerEntry.js';
import { Lot } from '../../models/Lot.js';
import { Order } from '../../models/Order.js';
import { round2 } from '../pricing/policy.js';
import { orderImpact, sumImpacts } from './calculate.js';

const toMap = (lots) => new Map(lots.map((lot) => [lot.code, lot]));

/** The signed-in customer's own impact, from their delivered orders only. */
export async function customerImpact(customerId) {
  const orders = await Order.find({ customer: customerId, status: 'delivered' })
    .select('items.allocations')
    .lean();
  const codes = [
    ...new Set(orders.flatMap((o) => o.items.flatMap((i) => i.allocations.map((a) => a.lotCode)))),
  ];
  const lots = await Lot.find({ code: { $in: codes } })
    .select('code bazarPriceBdt')
    .lean();
  const lotMap = toMap(lots);

  return {
    impact: sumImpacts(orders.map((order) => orderImpact(order, lotMap))),
    orders: orders.length,
    assumptions: IMPACT_FACTORS,
  };
}

/** Platform-wide totals for the public impact page. Numbers only, no personal data. */
export async function platformImpact() {
  const lotMap = toMap(await Lot.find().select('code bazarPriceBdt').lean());

  const impacts = [];
  for await (const order of Order.find({ status: 'delivered' })
    .select('items.allocations')
    .lean()
    .cursor()) {
    impacts.push(orderImpact(order, lotMap));
  }
  const total = sumImpacts(impacts);

  const [ledger] = await LedgerEntry.aggregate([
    { $group: { _id: null, farmerBdt: { $sum: '$farmerBdt' }, farmers: { $addToSet: '$farmer' } } },
  ]);

  return {
    impact: {
      ordersDelivered: impacts.length,
      kgRescued: total.kgRescued,
      savedBdt: total.savedBdt,
      co2eKg: total.co2eKg,
      farmerEarningsBdt: round2(ledger?.farmerBdt ?? 0),
      farmersEarning: ledger?.farmers.length ?? 0,
    },
    assumptions: IMPACT_FACTORS,
    asOf: new Date().toISOString(),
  };
}
