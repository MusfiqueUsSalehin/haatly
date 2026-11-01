import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { LEDGER_STATUS, LedgerEntry } from '../models/LedgerEntry.js';
import { User } from '../models/User.js';
import { userIdParams } from '../schemas/admin.js';
import { payoutSchema } from '../schemas/earnings.js';
import { payOutFarmer } from '../services/earnings/payout.js';
import { round2 } from '../services/pricing/policy.js';
import { AppError } from '../utils/AppError.js';

/** Mounted under /api/admin/earnings, after the admin-only guard. */
export function createAdminEarningsRouter() {
  const router = Router();

  // Who is owed money, and how much.
  router.get('/', async (_req, res) => {
    const owed = await LedgerEntry.aggregate([
      { $match: { status: LEDGER_STATUS.UNPAID } },
      {
        $group: {
          _id: '$farmer',
          unpaidBdt: { $sum: '$farmerBdt' },
          entries: { $sum: 1 },
          oldestDeliveredAt: { $min: '$deliveredAt' },
        },
      },
    ]);
    const users = await User.find({ _id: { $in: owed.map((row) => row._id) } })
      .select('name phone')
      .lean();
    const byId = new Map(users.map((user) => [String(user._id), user]));

    const farmers = owed
      .map((row) => ({
        farmerId: String(row._id),
        name: byId.get(String(row._id))?.name,
        phone: byId.get(String(row._id))?.phone,
        unpaidBdt: round2(row.unpaidBdt),
        entries: row.entries,
        oldestDeliveredAt: row.oldestDeliveredAt,
      }))
      .sort((a, b) => b.unpaidBdt - a.unpaidBdt || String(a.name).localeCompare(String(b.name)));
    res.json({ farmers });
  });

  router.post(
    '/:id/payout',
    validate(userIdParams, 'params'),
    validate(payoutSchema),
    async (req, res) => {
      const farmer = await User.findById(req.valid.params.id).select('role').lean();
      if (!farmer || farmer.role !== 'farmer') {
        throw new AppError(404, 'farmer_not_found', 'Farmer not found');
      }
      const payout = await payOutFarmer({
        farmerId: farmer._id,
        payoutRef: req.valid.body.payoutRef,
      });
      res.json({ payout });
    },
  );

  return router;
}
