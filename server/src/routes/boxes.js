import { Router } from 'express';
import { TIER_NAMES } from '../constants/boxes.js';
import { validate } from '../middleware/validate.js';
import { BOX_STATUS, Box } from '../models/Box.js';
import { boxCodeParams, boxesQuery } from '../schemas/boxes.js';
import { describeBoxes } from '../services/boxes/shelfView.js';
import { AppError } from '../utils/AppError.js';
import { bangladeshDate } from '../utils/dates.js';

/** Public: today's shelf. Units and prices are live, never stored. */
export function createBoxesRouter() {
  const router = Router();

  router.get('/', validate(boxesQuery, 'query'), async (req, res) => {
    const { city } = req.valid.query;
    const now = new Date();
    const date = bangladeshDate(now);

    const boxes = await Box.find({ cityCode: city, date, status: BOX_STATUS.LIVE }).lean();
    const views = (await describeBoxes(boxes, now))
      .filter((box) => !box.soldOut)
      .sort((a, b) => TIER_NAMES.indexOf(a.tier) - TIER_NAMES.indexOf(b.tier));

    res.json({ date, city, boxes: views });
  });

  // A box that sold out still answers (soldOut: true), so a saved link or cart can say so.
  router.get('/:code', validate(boxCodeParams, 'params'), async (req, res) => {
    const box = await Box.findOne({ code: req.valid.params.code, status: BOX_STATUS.LIVE }).lean();
    if (!box) throw new AppError(404, 'box_not_found', 'Box not found');
    const [view] = await describeBoxes([box], new Date());
    res.json({ box: view });
  });

  return router;
}
