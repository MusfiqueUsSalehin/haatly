import { Router } from 'express';
import { MARKDOWN_LADDER } from '../services/pricing/pricing.js';
import { PRICING_POLICY, maxDiscount } from '../services/pricing/policy.js';

export function createPricingRouter() {
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

  return router;
}
