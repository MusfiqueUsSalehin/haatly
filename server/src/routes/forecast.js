import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { City } from '../models/City.js';
import { forecastQuery } from '../schemas/forecast.js';
import { buildCityForecast } from '../services/forecast/cityForecast.js';
import { AppError } from '../utils/AppError.js';
import { createTtlCache } from '../utils/ttlCache.js';

/**
 * GET /api/forecast?city=dhaka&days=7: expected demand per produce, for approved farmers
 * (what to grow and list) and admins. The numbers are totals for a whole city, with no
 * customer details. Cached, because they scan weeks of orders.
 */
export function createForecastRouter({ tokens, cacheMs = 10 * 60 * 1000, now = () => Date.now() }) {
  const router = Router();
  const cache = createTtlCache({ ttlMs: cacheMs, now });

  router.get(
    '/',
    authenticate(tokens),
    requireRole('farmer', 'admin'),
    validate(forecastQuery, 'query'),
    async (req, res) => {
      const { city, days } = req.valid.query;
      if (!(await City.exists({ code: city, active: true }))) {
        throw new AppError(404, 'city_not_found', 'City not found');
      }
      res.json(
        await cache.get(`${city}:${days}`, () =>
          buildCityForecast({ cityCode: city, horizonDays: days }),
        ),
      );
    },
  );

  return router;
}
