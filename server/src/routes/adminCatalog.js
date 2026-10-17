import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { Produce } from '../models/Produce.js';
import { slugParams, updateProduceSchema } from '../schemas/catalog.js';
import { AppError } from '../utils/AppError.js';

/** Mounted under /api/admin/produce, after the admin-only guard. */
export function createAdminCatalogRouter() {
  const router = Router();

  // Unlike the public list, this includes inactive items so they can be reactivated.
  router.get('/', async (_req, res) => {
    const produce = await Produce.find().sort({ nameEn: 1 });
    res.json({ produce });
  });

  router.patch(
    '/:slug',
    validate(slugParams, 'params'),
    validate(updateProduceSchema),
    async (req, res) => {
      const produce = await Produce.findOne({ slug: req.valid.params.slug });
      if (!produce) throw new AppError(404, 'produce_not_found', 'Produce item not found');

      const changes = req.valid.body;
      produce.set(changes);
      // The price date only moves when the price itself changed.
      if (changes.bazarPriceBdt !== undefined) produce.bazarPriceUpdatedAt = new Date();
      await produce.save();

      res.json({ produce });
    },
  );

  return router;
}
