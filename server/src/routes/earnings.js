import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { LedgerEntry } from '../models/LedgerEntry.js';
import { entriesQuery } from '../schemas/earnings.js';
import { summarizeEarnings } from '../services/earnings/buildEarnings.js';
import { describeEntryForFarmer, describeSummaryForFarmer } from '../services/earnings/describe.js';

/** A farmer's own earnings. Nobody else's entries are ever visible here. */
export function createEarningsRouter({ tokens }) {
  const router = Router();

  router.use(authenticate(tokens), requireRole('farmer'));

  router.get('/', async (req, res) => {
    const entries = await LedgerEntry.find({ farmer: req.user._id }).lean();
    res.json({ summary: describeSummaryForFarmer(summarizeEarnings(entries)) });
  });

  router.get('/entries', validate(entriesQuery, 'query'), async (req, res) => {
    const { status, page, limit } = req.valid.query;
    const filter = { farmer: req.user._id, ...(status && { status }) };
    const [entries, total] = await Promise.all([
      LedgerEntry.find(filter)
        .sort({ deliveredAt: -1, orderCode: 1, lotCode: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      LedgerEntry.countDocuments(filter),
    ]);
    res.json({ entries: entries.map(describeEntryForFarmer), page, limit, total });
  });

  return router;
}
