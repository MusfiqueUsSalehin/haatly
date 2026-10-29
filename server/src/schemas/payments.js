import { z } from 'zod';
import { ORDER_CODE_PATTERN } from '../constants/orders.js';

export const webhookEventSchema = z.object({
  id: z.string().min(1).max(60),
  type: z.enum(['payment.succeeded', 'payment.failed']),
  providerRef: z.string().min(1).max(80),
  orderCode: z.string().regex(ORDER_CODE_PATTERN),
  amountBdt: z.number().int().min(1),
  createdAt: z.string().max(40),
});

export const sandboxCompleteSchema = z.object({
  providerRef: z.string().min(1).max(80),
  outcome: z.enum(['succeeded', 'failed']),
});
