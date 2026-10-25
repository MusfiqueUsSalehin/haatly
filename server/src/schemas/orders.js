import { z } from 'zod';
import {
  MAX_ITEMS,
  MAX_QTY_PER_ITEM,
  ORDER_CODE_PATTERN,
  ORDER_STATUSES,
  PAYMENT_METHODS,
} from '../constants/orders.js';
import { CODE_PATTERN } from '../utils/codes.js';
import { nameField, phoneField } from './auth.js';

const itemSchema = z.object({
  boxCode: z
    .string()
    .max(60)
    .regex(CODE_PATTERN, 'must be a box code like "dhaka-family-2026-10-17"'),
  qty: z.number().int().min(1).max(MAX_QTY_PER_ITEM),
  // The price per box the customer was shown. The order is refused if it has gone up.
  seenUnitPriceBdt: z.number().int().min(1),
});

export const placeOrderSchema = z
  .object({
    recipientName: nameField,
    phone: phoneField,
    zoneCode: z
      .string()
      .max(60)
      .regex(CODE_PATTERN, 'must be a delivery area code like "dhaka-mirpur"'),
    address: z.object({
      line: z.string().trim().min(5).max(200),
      landmark: z.string().trim().max(100).optional(),
    }),
    paymentMethod: z.enum(PAYMENT_METHODS).default('cod'),
    items: z.array(itemSchema).min(1).max(MAX_ITEMS),
  })
  .refine((order) => new Set(order.items.map((i) => i.boxCode)).size === order.items.length, {
    path: ['items'],
    message: 'each box may appear only once',
  });

export const orderCodeParams = z.object({
  code: z.string().regex(ORDER_CODE_PATTERN, 'must be an order code like ORD-7KQ2XM4D'),
});

export const listOrdersQuery = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// A cancel request may have no body at all, so an empty one is treated as {}.
export const cancelOrderSchema = z
  .object({ reason: z.string().trim().max(200).optional() })
  .default({});
