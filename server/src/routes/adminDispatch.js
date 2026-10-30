import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { City } from '../models/City.js';
import { RiderProfile } from '../models/RiderProfile.js';
import { Run } from '../models/Run.js';
import { User } from '../models/User.js';
import { Zone } from '../models/Zone.js';
import { userIdParams } from '../schemas/admin.js';
import { adminRunsQuery, dispatchSchema, riderProfileSchema } from '../schemas/dispatch.js';
import { dispatchCity } from '../services/dispatch/dispatchCity.js';
import { AppError } from '../utils/AppError.js';

/** Mounted under /api/admin, after the admin-only guard. */
export function createAdminDispatchRouter() {
  const router = Router();

  router.post('/dispatch', validate(dispatchSchema), async (req, res) => {
    const { runs, unassigned } = await dispatchCity({ cityCode: req.valid.body.cityCode });
    res.json({ runs: runs.map((run) => run.toJSON()), unassigned });
  });

  router.get('/runs', validate(adminRunsQuery, 'query'), async (req, res) => {
    const { status, cityCode, page, limit } = req.valid.query;
    const filter = { ...(status && { status }), ...(cityCode && { cityCode }) };
    const [runs, total] = await Promise.all([
      Run.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Run.countDocuments(filter),
    ]);
    res.json({ runs, page, limit, total });
  });

  router.get('/riders', async (_req, res) => {
    const profiles = await RiderProfile.find().sort({ cityCode: 1, createdAt: 1 }).lean();
    const users = await User.find({ _id: { $in: profiles.map((p) => p.user) } })
      .select('name phone status')
      .lean();
    const byId = new Map(users.map((user) => [String(user._id), user]));
    res.json({
      riders: profiles.map((profile) => ({
        userId: String(profile.user),
        name: byId.get(String(profile.user))?.name,
        phone: byId.get(String(profile.user))?.phone,
        status: byId.get(String(profile.user))?.status,
        cityCode: profile.cityCode,
        vehicle: profile.vehicle,
        zoneCodes: profile.zoneCodes,
        onDuty: profile.onDuty,
      })),
    });
  });

  // Create or update a rider's city, vehicle and zones. Riders must be approved first.
  router.put(
    '/riders/:id',
    validate(userIdParams, 'params'),
    validate(riderProfileSchema),
    async (req, res) => {
      const user = await User.findById(req.valid.params.id);
      if (!user || user.role !== 'rider')
        throw new AppError(404, 'rider_not_found', 'Rider not found');
      if (user.status !== 'active') {
        throw new AppError(409, 'rider_not_active', 'Approve this rider before assigning them');
      }

      const { cityCode, vehicle, zoneCodes } = req.valid.body;
      if (!(await City.exists({ code: cityCode, active: true }))) {
        throw new AppError(404, 'city_not_found', 'City not found');
      }
      const known = new Set(
        (
          await Zone.find({ code: { $in: zoneCodes }, cityCode, active: true })
            .select('code')
            .lean()
        ).map((zone) => zone.code),
      );
      const unknown = zoneCodes.filter((zone) => !known.has(zone));
      if (unknown.length > 0) {
        throw new AppError(400, 'validation_error', 'Validation failed', {
          zoneCodes: `unknown zones for ${cityCode}: ${unknown.join(', ')}`,
        });
      }

      const profile = await RiderProfile.findOneAndUpdate(
        { user: user._id },
        { $set: { cityCode, vehicle, zoneCodes }, $setOnInsert: { onDuty: false } },
        { upsert: true, returnDocument: 'after' },
      );
      res.json({ profile });
    },
  );

  return router;
}
