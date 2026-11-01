import { LEDGER_STATUS, LedgerEntry } from '../../models/LedgerEntry.js';
import { AppError } from '../../utils/AppError.js';
import { round2 } from '../pricing/policy.js';

/**
 * Mark everything a farmer is owed as paid. Each entry is claimed by one atomic update that
 * only touches unpaid entries, so an entry can never be paid twice, even if two admins
 * press the button at once: each entry belongs to exactly one payout.
 */
export async function payOutFarmer({ farmerId, payoutRef, now = new Date() }) {
  const { modifiedCount } = await LedgerEntry.updateMany(
    { farmer: farmerId, status: LEDGER_STATUS.UNPAID },
    { $set: { status: LEDGER_STATUS.PAID, payoutRef, paidAt: now } },
  );
  if (modifiedCount === 0) {
    throw new AppError(409, 'nothing_to_pay', 'This farmer has nothing unpaid');
  }

  const claimed = await LedgerEntry.find({ farmer: farmerId, payoutRef, paidAt: now })
    .select('farmerBdt')
    .lean();
  return {
    payoutRef,
    paidEntries: claimed.length,
    paidBdt: round2(claimed.reduce((sum, entry) => sum + entry.farmerBdt, 0)),
  };
}
