import { z } from 'zod';
import { LEDGER_STATUS } from '../models/LedgerEntry.js';

export const entriesQuery = z.object({
  status: z.enum(Object.values(LEDGER_STATUS)).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const payoutSchema = z.object({
  // Your own reference for the transfer, for example the bKash transaction id.
  payoutRef: z.string().trim().min(3).max(80),
});
