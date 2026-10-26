import { LOT_STATUS, Lot } from '../../models/Lot.js';
import { AppError } from '../../utils/AppError.js';

/**
 * Put kilos back on their lots (cancelled order, or rollback of a failed reservation).
 * A lot that had sold out goes back on sale, unless it has expired or been withdrawn.
 * Callers must make sure the same allocations are never released twice.
 */
export async function releaseStock(allocations, now = new Date()) {
  if (allocations.length === 0) return;

  for (const { lotCode, kg } of allocations) {
    await Lot.updateOne({ code: lotCode }, { $inc: { remainingKg: kg } });
  }
  await Lot.updateMany(
    {
      code: { $in: allocations.map((a) => a.lotCode) },
      status: LOT_STATUS.SOLD_OUT,
      remainingKg: { $gt: 0 },
      expiresAt: { $gt: now },
    },
    { status: LOT_STATUS.LISTED },
  );
}

/**
 * Take the kilos for an order. Each lot is updated in one atomic step that only works
 * while the lot is listed, unexpired and still holds enough, so two orders can never take
 * the same kilos. If any lot cannot supply its share, everything already taken is put
 * back and a 409 is thrown.
 */
export async function reserveStock(allocations, now = new Date()) {
  const reserved = [];

  for (const allocation of allocations) {
    const { modifiedCount } = await Lot.updateOne(
      {
        code: allocation.lotCode,
        status: LOT_STATUS.LISTED,
        expiresAt: { $gt: now },
        remainingKg: { $gte: allocation.kg },
      },
      { $inc: { remainingKg: -allocation.kg } },
    );

    if (modifiedCount !== 1) {
      await releaseStock(reserved, now);
      throw new AppError(
        409,
        'stock_changed',
        'Some produce just sold out. Please refresh and try again.',
        { lotCode: allocation.lotCode },
      );
    }
    reserved.push(allocation);
  }

  await Lot.updateMany(
    {
      code: { $in: allocations.map((a) => a.lotCode) },
      status: LOT_STATUS.LISTED,
      remainingKg: { $lte: 0 },
    },
    { status: LOT_STATUS.SOLD_OUT },
  );
}
