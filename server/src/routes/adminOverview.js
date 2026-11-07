// server/src/routes/adminOverview.js
import { Router } from 'express';
import { Lot } from '../models/Lot.js';
import { Order } from '../models/Order.js';
import { RiderProfile } from '../models/RiderProfile.js';
import { Run } from '../models/Run.js';
import { User } from '../models/User.js';

const HOUR_MS = 3_600_000;

/**
 * GET /api/admin/overview: the numbers behind the control room. Totals only, no customer
 * details. The router is mounted under the admin guard, so it never checks roles itself.
 */
export function createAdminOverviewRouter({ now = () => new Date() } = {}) {
  const router = Router();

  router.get('/overview', async (_req, res) => {
    const at = now();
    const weekAgo = new Date(at.getTime() - 7 * 24 * HOUR_MS);
    const soon = new Date(at.getTime() + 12 * HOUR_MS);
    const recentOrders = { createdAt: { $gte: weekAgo }, status: { $ne: 'cancelled' } };

    const [
      pendingApprovals,
      ridersOnDuty,
      runsInProgress,
      lotsAtRisk,
      [orderTotals],
      [lotTotals],
      topZones,
    ] = await Promise.all([
      User.countDocuments({ status: 'pending' }),
      RiderProfile.countDocuments({ onDuty: true }),
      Run.countDocuments({ status: 'in_progress' }),
      Lot.countDocuments({
        status: 'listed',
        remainingKg: { $gt: 0 },
        expiresAt: { $gt: at, $lte: soon },
      }),
      Order.aggregate([
        { $match: recentOrders },
        { $group: { _id: null, orders: { $sum: 1 }, revenueBdt: { $sum: '$totalBdt' } } },
      ]),
      Lot.aggregate([
        { $match: { listedAt: { $gte: weekAgo } } },
        {
          $group: {
            _id: null,
            listedKg: { $sum: '$quantityKg' },
            remainingKg: { $sum: '$remainingKg' },
          },
        },
      ]),
      Order.aggregate([
        { $match: recentOrders },
        { $group: { _id: '$zoneCode', orders: { $sum: 1 } } },
        { $sort: { orders: -1, _id: 1 } },
        { $limit: 5 },
      ]),
    ]);

    const listedKg = lotTotals?.listedKg ?? 0;
    const soldKg = listedKg - (lotTotals?.remainingKg ?? 0);

    res.json({
      asOf: at.toISOString(),
      last7Days: { orders: orderTotals?.orders ?? 0, revenueBdt: orderTotals?.revenueBdt ?? 0 },
      // Share of the kilos listed this week that have actually been sold.
      rescueRatePct: listedKg > 0 ? Math.round((soldKg / listedKg) * 1000) / 10 : null,
      lotsAtRisk,
      pendingApprovals,
      ridersOnDuty,
      runsInProgress,
      topZones: topZones.map((z) => ({ zoneCode: z._id, orders: z.orders })),
    });
  });

  return router;
}
