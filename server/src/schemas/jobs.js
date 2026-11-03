import { z } from 'zod';
import { JOB_NAME_PATTERN, JOB_STATUSES } from '../constants/jobs.js';

export const jobRunsQuery = z.object({
  name: z.string().max(60).regex(JOB_NAME_PATTERN).optional(),
  status: z.enum(JOB_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
