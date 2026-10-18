import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { City } from '../models/City.js';
import { Hub } from '../models/Hub.js';
import { Produce } from '../models/Produce.js';
import { Zone } from '../models/Zone.js';
import { hubsQuery, produceQuery, slugParams } from '../schemas/catalog.js';
import { AppError } from '../utils/AppError.js';

/** Public, read-only reference data. Inactive records are never exposed here. */
export function createCatalogRouter() {
  const router = Router();

  router.get('/produce', validate(produceQuery, 'query'), async (req, res) => {
    const { category } = req.valid.query;
    const produce = await Produce.find({ active: true, ...(category && { category }) }).sort({
      nameEn: 1,
    });
    res.json({ produce });
  });

  router.get('/produce/:slug', validate(slugParams, 'params'), async (req, res) => {
    const item = await Produce.findOne({ slug: req.valid.params.slug, active: true });
    if (!item) throw new AppError(404, 'produce_not_found', 'Produce item not found');
    res.json({ produce: item });
  });

  router.get('/cities', async (_req, res) => {
    const [cities, zones] = await Promise.all([
      City.find({ active: true }).sort({ nameEn: 1 }),
      Zone.find({ active: true }).sort({ nameEn: 1 }),
    ]);
    res.json({
      cities: cities.map((city) => ({
        ...city.toJSON(),
        zones: zones.filter((zone) => zone.cityCode === city.code).map((zone) => zone.toJSON()),
      })),
    });
  });

  // With ?city=dhaka: the depot in that city plus every collection hub that can supply it,
  // nearest first, each with its truck time to that city.
  router.get('/hubs', validate(hubsQuery, 'query'), async (req, res) => {
    const { city, kind } = req.valid.query;
    const filter = { active: true, ...(kind && { kind }) };
    if (city) filter.$or = [{ cityCode: city }, { 'serves.cityCode': city }];

    let hubs = (await Hub.find(filter)).map((hub) => hub.toJSON());
    if (city) {
      hubs = hubs
        .map((hub) => ({
          ...hub,
          truckHoursToCity: hub.serves.find((s) => s.cityCode === city)?.truckHours ?? null,
        }))
        .sort((a, b) => (a.truckHoursToCity ?? 0) - (b.truckHoursToCity ?? 0));
    } else {
      hubs.sort((a, b) => a.nameEn.localeCompare(b.nameEn));
    }
    res.json({ hubs });
  });

  return router;
}
