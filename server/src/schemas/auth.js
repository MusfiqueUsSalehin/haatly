import { z } from 'zod';
import { SELF_REGISTER_ROLES } from '../constants/roles.js';

export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email('must be a valid email address'));

/** Accepts 01712345678, 8801712345678 or +8801712345678 and stores +8801712345678. */
export const phoneField = z
  .string()
  .trim()
  .transform((raw) => {
    const match = raw.replace(/[\s-]/g, '').match(/^(?:\+?88)?(01[3-9]\d{8})$/);
    return match ? `+88${match[1]}` : raw;
  })
  .refine((value) => /^\+8801[3-9]\d{8}$/.test(value), {
    message: 'must be a valid Bangladesh mobile number, e.g. 01712345678',
  });

export const passwordField = z
  .string()
  .min(10, 'must be at least 10 characters')
  .max(128, 'must be at most 128 characters');

export const nameField = z.string().trim().min(2, 'is too short').max(80, 'is too long');

export const registerSchema = z.object({
  name: nameField,
  email: emailField,
  phone: phoneField,
  password: passwordField,
  role: z.enum(SELF_REGISTER_ROLES).default('customer'),
});

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'is required').max(128),
});
