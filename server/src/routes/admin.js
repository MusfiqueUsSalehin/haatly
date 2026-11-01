import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { createAdminCatalogRouter } from './adminCatalog.js';
import { validate } from '../middleware/validate.js';
import {
  createStaffSchema,
  listUsersQuery,
  setStatusSchema,
  userIdParams,
} from '../schemas/admin.js';
import { User } from '../models/User.js';
import { USER_STATUS } from '../constants/roles.js';
import { createUser } from '../services/userService.js';
import { AppError } from '../utils/AppError.js';

import { createAdminShelfRouter } from './adminShelf.js';
import { createAdminDispatchRouter } from './adminDispatch.js';
import { createAdminEarningsRouter } from './adminEarnings.js';

export function createAdminRouter({ tokens }) {
  const router = Router();

  router.use(authenticate(tokens), requireRole('admin'));
  router.use('/produce', createAdminCatalogRouter());
  router.use('/shelf', createAdminShelfRouter());
  router.use('/earnings', createAdminEarningsRouter());
  router.use(createAdminDispatchRouter());

  // Filters use exact matches only, so there is no free-text search to inject into.
  router.get('/users', validate(listUsersQuery, 'query'), async (req, res) => {
    const { role, status, page, limit } = req.valid.query;
    const filter = { ...(role && { role }), ...(status && { status }) };
    const [users, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      User.countDocuments(filter),
    ]);
    res.json({ users, page, limit, total });
  });

  // Staff accounts (hub managers, admins) can only be created here, never by sign-up.
  router.post('/users', validate(createStaffSchema), async (req, res) => {
    const user = await createUser({ ...req.valid.body, status: USER_STATUS.ACTIVE });
    res.status(201).json({ user });
  });

  // Approve a pending farmer or rider (active), or suspend any account.
  router.patch(
    '/users/:id/status',
    validate(userIdParams, 'params'),
    validate(setStatusSchema),
    async (req, res) => {
      const { id } = req.valid.params;
      const { status, reason } = req.valid.body;

      if (id === String(req.user._id)) {
        throw new AppError(400, 'cannot_modify_self', 'You cannot change your own status');
      }
      const user = await User.findById(id);
      if (!user) throw new AppError(404, 'user_not_found', 'User not found');

      user.status = status;
      user.statusReason = reason;
      user.reviewedBy = req.user._id;
      user.reviewedAt = new Date();
      await user.save();

      res.json({ user });
    },
  );

  return router;
}
