import { z } from 'zod';
import { ROLES, STAFF_ROLES, STATUSES } from '../constants/roles.js';
import { emailField, nameField, passwordField, phoneField } from './auth.js';

export const createStaffSchema = z.object({
  name: nameField,
  email: emailField,
  phone: phoneField,
  password: passwordField,
  role: z.enum(STAFF_ROLES),
});

export const setStatusSchema = z.object({
  status: z.enum(['active', 'suspended']),
  reason: z.string().trim().max(300).optional(),
});

export const userIdParams = z.object({
  id: z.string().regex(/^[0-9a-f]{24}$/i, 'must be a valid user id'),
});

export const listUsersQuery = z.object({
  role: z.enum(ROLES).optional(),
  status: z.enum(STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
