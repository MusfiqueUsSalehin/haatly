import { describe, expect, it } from 'vitest';
import { createStaffSchema } from '../../src/schemas/admin.js';

const base = {
  name: 'Staff One',
  email: 'staff@example.com',
  phone: '+8801712345678',
  password: 'a-strong-password',
};

describe('createStaffSchema', () => {
  it('needs a hub for hub managers and forbids one on admins', () => {
    expect(createStaffSchema.safeParse({ ...base, role: 'hub_manager' }).success).toBe(false);
    expect(
      createStaffSchema.safeParse({ ...base, role: 'hub_manager', hubCode: 'savar' }).success,
    ).toBe(true);
    expect(createStaffSchema.safeParse({ ...base, role: 'admin' }).success).toBe(true);
    expect(createStaffSchema.safeParse({ ...base, role: 'admin', hubCode: 'savar' }).success).toBe(
      false,
    );
  });
});
