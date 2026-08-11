/**
 * Shared auth helper for API routes.
 *
 * Usage:
 *   const uid = await requireAuth(req, res);
 *   if (!uid) return; // response already sent
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyIdToken, isAdminConfigured } from './firebaseAdmin';

/**
 * Like requireAuth, but returns the decoded token's verified claims beyond uid
 * (e.g. `name`, used to derive a default leaderboard alias).
 */
export async function requireAuthDecoded(
  req: VercelRequest,
  res: VercelResponse,
): Promise<{ uid: string; name?: string } | null> {
  if (!isAdminConfigured()) {
    res.status(503).json({ error: 'server_misconfigured', message: 'Firebase Admin is not configured.' });
    return null;
  }
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!idToken) {
    res.status(401).json({ error: 'unauthorized', message: 'Missing Authorization: Bearer <token> header.' });
    return null;
  }
  try {
    const decoded = await verifyIdToken(idToken);
    const name = (decoded as Record<string, unknown>).name;
    return { uid: decoded.uid, name: typeof name === 'string' ? name : undefined };
  } catch {
    res.status(401).json({ error: 'unauthorized', message: 'Invalid or expired token.' });
    return null;
  }
}

export async function requireAuth(
  req: VercelRequest,
  res: VercelResponse,
): Promise<string | null> {
  if (!isAdminConfigured()) {
    res.status(503).json({ error: 'server_misconfigured', message: 'Firebase Admin is not configured.' });
    return null;
  }
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!idToken) {
    res.status(401).json({ error: 'unauthorized', message: 'Missing Authorization: Bearer <token> header.' });
    return null;
  }
  try {
    const decoded = await verifyIdToken(idToken);
    return decoded.uid;
  } catch {
    res.status(401).json({ error: 'unauthorized', message: 'Invalid or expired token.' });
    return null;
  }
}
