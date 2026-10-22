import { randomInt } from 'node:crypto';

// No 0/O or 1/I, so codes survive being read aloud or written on a crate.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** A random, unguessable code such as LOT-7KQ2XM4D (uses a secure random source). */
export function randomCode(prefix, length = 8) {
  let body = '';
  for (let i = 0; i < length; i++) body += ALPHABET[randomInt(ALPHABET.length)];
  return `${prefix}-${body}`;
}
