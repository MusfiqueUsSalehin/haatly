import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

// scrypt at N=2^15, r=8, p=3 is one of OWASP's recommended settings (about 32 MiB per hash).
const PARAMS = { N: 2 ** 15, r: 8, p: 3 };
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const MAX_MEMORY = 64 * 1024 * 1024;

/**
 * Hash a password. The result is self-describing, so the cost can be raised later
 * without breaking existing hashes: scrypt$N$r$p$salt$hash
 */
export async function hashPassword(password) {
  const salt = randomBytes(SALT_LENGTH);
  const hash = await scrypt(password, salt, KEY_LENGTH, { ...PARAMS, maxmem: MAX_MEMORY });
  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64url'),
    hash.toString('base64url'),
  ].join('$');
}

/** Returns true only when the password matches. Never throws on malformed input. */
export async function verifyPassword(password, stored) {
  const parts = typeof stored === 'string' ? stored.split('$') : [];
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, N, r, p, salt, hash] = parts;
  const params = { N: Number(N), r: Number(r), p: Number(p) };
  if (!Object.values(params).every(Number.isSafeInteger)) return false;

  const expected = Buffer.from(hash, 'base64url');
  let actual;
  try {
    actual = await scrypt(password, Buffer.from(salt, 'base64url'), expected.length, {
      ...params,
      maxmem: MAX_MEMORY,
    });
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
