import { describe, expect, it } from 'vitest';
import { loginSchema, registerSchema } from '../../src/schemas/auth.js';

const valid = {
  name: ' Rahim Uddin ',
  email: ' Rahim@Example.COM ',
  phone: '01712345678',
  password: 'a-strong-password',
};

describe('registerSchema', () => {
  it('cleans the input and defaults the role to customer', () => {
    const result = registerSchema.parse(valid);
    expect(result).toEqual({
      name: 'Rahim Uddin',
      email: 'rahim@example.com',
      phone: '+8801712345678',
      password: 'a-strong-password',
      role: 'customer',
    });
  });

  it.each(['01712345678', '8801712345678', '+8801712345678', '+88 017-1234 5678'])(
    'normalises the phone number %s',
    (phone) => {
      expect(registerSchema.parse({ ...valid, phone }).phone).toBe('+8801712345678');
    },
  );

  it.each(['12345', '+14155550123', '01212345678', '0171234567', 'abc'])(
    'rejects the phone number %s',
    (phone) => {
      expect(registerSchema.safeParse({ ...valid, phone }).success).toBe(false);
    },
  );

  it('allows farmer and rider but never staff roles', () => {
    expect(registerSchema.parse({ ...valid, role: 'farmer' }).role).toBe('farmer');
    expect(registerSchema.parse({ ...valid, role: 'rider' }).role).toBe('rider');
    expect(registerSchema.safeParse({ ...valid, role: 'admin' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, role: 'hub_manager' }).success).toBe(false);
  });

  it('strips fields a client must not control', () => {
    const result = registerSchema.parse({ ...valid, status: 'active', isAdmin: true });
    expect(result).not.toHaveProperty('status');
    expect(result).not.toHaveProperty('isAdmin');
  });

  it('rejects short passwords and bad emails', () => {
    expect(registerSchema.safeParse({ ...valid, password: 'short' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('lowercases the email and requires a password', () => {
    expect(loginSchema.parse({ email: 'A@B.com', password: 'x' }).email).toBe('a@b.com');
    expect(loginSchema.safeParse({ email: 'a@b.com', password: '' }).success).toBe(false);
  });
});
