import { LOT_STATUS, Lot } from '../../models/Lot.js';
import { AppError } from '../../utils/AppError.js';

/**
 * Withdraw one of the farmer's own listed lots. Unsold kilos stop being sold; kilos
 * already sold are untouched. Returns the updated lot.
 */
export async function withdrawLot({ farmer, code }) {
  // One atomic step: only a lot that is still listed, and owned by this farmer, changes.
  const lot = await Lot.findOneAndUpdate(
    { code, farmer: farmer._id, status: LOT_STATUS.LISTED },
    { status: LOT_STATUS.WITHDRAWN },
    { returnDocument: 'after' },
  );
  if (lot) return lot;

  const existing = await Lot.findOne({ code, farmer: farmer._id });
  if (!existing) throw new AppError(404, 'lot_not_found', 'Lot not found');
  throw new AppError(409, 'lot_not_listed', `This lot is already ${existing.status}`);
}
