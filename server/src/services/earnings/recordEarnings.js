import { LedgerEntry } from '../../models/LedgerEntry.js';
import { Lot } from '../../models/Lot.js';
import { Order } from '../../models/Order.js';
import { buildEarnings } from './buildEarnings.js';

/**
 * Write the earnings of a delivered order to the ledger, one entry per lot. Safe to call
 * any number of times, even at the same moment: the unique (order, lot) index lets exactly
 * one write win, and the others count as "existing". Does nothing for an order that is
 * not delivered. Throws if a lot is missing, because money records are never guessed.
 */
export async function recordEarnings(orderCode) {
  const order = await Order.findOne({ code: orderCode }).lean();
  if (!order || order.status !== 'delivered' || !order.deliveredAt) {
    return { recorded: 0, existing: 0 };
  }

  const lotCodes = [
    ...new Set(order.items.flatMap((item) => item.allocations.map((a) => a.lotCode))),
  ];
  const lots = await Lot.find({ code: { $in: lotCodes } })
    .select('code farmer farmerFloorBdt')
    .lean();
  const entries = buildEarnings({ order, lots });

  let recorded = 0;
  for (const entry of entries) {
    try {
      await LedgerEntry.create(entry); // create() runs the floor check
      recorded += 1;
    } catch (err) {
      if (err?.code !== 11000) throw err;
    }
  }
  return { recorded, existing: entries.length - recorded };
}

/**
 * The version a delivery uses. It never throws, so a ledger problem cannot undo a
 * delivery that already happened. Anything it misses is picked up by backfillEarnings().
 */
export async function recordEarningsSafely(orderCode) {
  try {
    return await recordEarnings(orderCode);
  } catch {
    return null;
  }
}

/** Record earnings for every delivered order that has none yet. Safe to run repeatedly. */
export async function backfillEarnings() {
  const delivered = await Order.find({ status: 'delivered' }).select('code').lean();
  let recorded = 0;
  const failed = [];

  for (const { code } of delivered) {
    try {
      recorded += (await recordEarnings(code)).recorded;
    } catch (err) {
      failed.push({ orderCode: code, error: err.message });
    }
  }
  return { checked: delivered.length, recorded, failed };
}
