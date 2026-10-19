/**
 * A caller address, only ever as a salted hash. Raw addresses are never stored
 * or logged. The salt is `ADDRESS_HASH_SALT` when set (recommended: a random
 * secret in Vercel), so a stored hash cannot be matched against a list of
 * addresses by someone holding only the database.
 */
import { createHash } from 'node:crypto';

type Req = { headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } };

export function clientAddress(req: Req): string | null {
  const fwd = req.headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd || '').split(',')[0].trim();
  return first || req.socket?.remoteAddress || null;
}

/** `purpose` separates uses, so a rate-limit key never equals a stored fraud signal. */
export function hashAddress(address: string | null, purpose: string): string | null {
  if (!address) return null;
  const salt = process.env.ADDRESS_HASH_SALT || 'edlight-address-v1';
  return createHash('sha256').update(`${salt}:${purpose}:${address}`).digest('hex').slice(0, 24);
}
