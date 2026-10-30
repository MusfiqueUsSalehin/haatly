import { z } from 'zod';
import {
  MAX_OTP_ATTEMPTS,
  RUN_CODE_PATTERN,
  RUN_STATUSES,
  VEHICLE_NAMES,
} from '../constants/dispatch.js';
import { ORDER_CODE_PATTERN } from '../constants/orders.js';
import { CODE_PATTERN } from '../utils/codes.js';

const code = z.string().max(60).regex(CODE_PATTERN, 'must be a lowercase code like "dhaka"');
const paging = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

// Admin
export const dispatchSchema = z.object({ cityCode: code });
export const adminRunsQuery = z.object({
  status: z.enum(RUN_STATUSES).optional(),
  cityCode: code.optional(),
  ...paging,
});
export const riderProfileSchema = z.object({
  cityCode: code,
  vehicle: z.enum(VEHICLE_NAMES),
  zoneCodes: z.array(code).max(30).default([]),
});

// Rider
export const riderRunsQuery = z.object({ status: z.enum(RUN_STATUSES).optional(), ...paging });
export const runParams = z.object({
  code: z.string().regex(RUN_CODE_PATTERN, 'must be a run code like RUN-7KQ2XM4D'),
});
export const stopParams = runParams.extend({
  orderCode: z.string().regex(ORDER_CODE_PATTERN, 'must be an order code like ORD-7KQ2XM4D'),
});
export const dutySchema = z.object({ onDuty: z.boolean() });
export const deliverSchema = z.object({
  otp: z
    .string()
    .regex(/^\d{6}$/, `must be the customer's 6-digit code (${MAX_OTP_ATTEMPTS} tries)`),
});
export const failSchema = z.object({ reason: z.string().trim().min(2).max(200) });
