import { describe, expect, it } from 'vitest';
import { User } from '../../src/models/User.js';
import { initialStatusFor } from '../../src/constants/roles.js';

const base = {
  name: 'Rahim Uddin',
  email: 'Rahim@Example.com',
  phone: '+8801712345678',
  passwordHash: 'scrypt$x',
  role: 'customer',
  status: 'active',
};

/** Returns the validation errors keyed by field, or {} when the document is valid. */
async function errorsOf(doc) {
  try {
    await doc.validate();
    return {};
  } catch (err) {
    return err.errors;
  }
}

describe('User model', () => {
  it('accepts a valid user and lowercases the email', async () => {
    const user = new User(base);
    expect(await errorsOf(user)).toEqual({});
    expect(user.email).toBe('rahim@example.com');
  });

  it('rejects an unknown role or status', async () => {
    expect((await errorsOf(new User({ ...base, role: 'superuser' }))).role).toBeDefined();
    expect((await errorsOf(new User({ ...base, status: 'banned' }))).status).toBeDefined();
  });

  it('rejects a non-Bangladesh phone number', async () => {
    expect((await errorsOf(new User({ ...base, phone: '+14155550123' }))).phone).toBeDefined();
  });

  it('requires name, email, phone and passwordHash', async () => {
    const errors = await errorsOf(new User({ role: 'customer', status: 'active' }));
    expect(Object.keys(errors)).toEqual(
      expect.arrayContaining(['name', 'email', 'phone', 'passwordHash']),
    );
  });

  it('never serialises the password hash', () => {
    const json = new User(base).toJSON();
    expect(json.passwordHash).toBeUndefined();
    expect(json.__v).toBeUndefined();
    expect(json.id).toBeTypeOf('string');
    expect(json._id).toBeUndefined();
  });

  it('keeps passwordHash out of queries by default', () => {
    expect(User.schema.path('passwordHash').options.select).toBe(false);
  });
});

describe('initialStatusFor', () => {
  it('activates customers immediately and holds farmers and riders for approval', () => {
    expect(initialStatusFor('customer')).toBe('active');
    expect(initialStatusFor('farmer')).toBe('pending');
    expect(initialStatusFor('rider')).toBe('pending');
  });
});
