import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { Produce } from '../models/Produce.js';
import { quoteSchema } from '../schemas/pricing.js';
import { PRICING_POLICY, maxDiscount } from '../services/pricing/policy.js';
import { MARKDOWN_LADDER, priceLot } from '../services/pricing/pricing.js';
import { AppError } from '../utils/AppError.js';

// Points along the lot's remaining time at which the quote also shows the price.
const SCHEDULE_FRACTIONS = [1, 0.75, 0.5, 0.25, 0.1];

export function createPricingRouter({ tokens }) {
  const router = Router();

  // Public: the money rules are not a secret, and the app uses them to explain prices.
  router.get('/policy', (_req, res) => {
    res.json({
      policy: {
        currency: 'BDT',
        farmerSharePct: Math.round(PRICING_POLICY.farmerShare * 100),
        farmerFloorPct: Math.round(PRICING_POLICY.farmerFloorRatio * 100),
        maxDiscountPct: Math.floor(maxDiscount() * 100),
        ladder: MARKDOWN_LADDER,
      },
    });
  });

  // What a lot would be priced at, and how that price falls as time runs out.
  router.post(
    '/quote',
    authenticate(tokens),
    requireRole('farmer', 'admin'),
    validate(quoteSchema),
    async (req, res) => {
      const { produceSlug, grade, shelfLifeDays, hoursToExpiry } = req.valid.body;

      const item = await Produce.findOne({ slug: produceSlug, active: true });
      if (!item) throw new AppError(404, 'produce_not_found', 'Produce item not found');
      if (shelfLifeDays > item.shelfLifeDays) {
        throw new AppError(400, 'validation_error', 'Validation failed', {
          shelfLifeDays: `cannot be longer than the catalog shelf life of ${item.shelfLifeDays} days`,
        });
      }

      const produce = { bazarPriceBdt: item.bazarPriceBdt, peakMonths: item.peakMonths };
      const price = (hours) => priceLot({ produce, shelfLifeDays, hoursToExpiry: hours, grade });

      const schedule = SCHEDULE_FRACTIONS.map((fraction) => {
        const hours = Math.round(hoursToExpiry * fraction);
        const { priceBdt, discountPct, farmerPayoutBdt } = price(hours);
        return { hoursToExpiry: hours, priceBdt, discountPct, farmerPayoutBdt };
      });

      res.json({ quote: price(hoursToExpiry), schedule });
    },
  );

  return router;
}
