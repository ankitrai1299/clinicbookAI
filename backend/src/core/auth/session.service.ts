// Session revocation.
//
// Before this, a stolen token was valid for its full seven days and there was
// nothing anyone could do about it: no logout that meant anything on the server,
// no way to cut off a lost laptop, no way to end sessions when a password
// changed. "Sign out" cleared localStorage and the token kept working.
//
// The mechanism is a version integer on the user that also travels in the token.
// Bumping it invalidates every token that user holds, in one UPDATE. That is
// coarser than per-device sessions, and deliberately so — the three things
// actually needed (sign out everywhere, password changed, account compromised)
// are all "invalidate everything", and per-device would have put a database read
// on every request to buy a capability nobody asked for.
//
// A token with no version claim reads as version 0, which is the default for
// every existing row. So the deploy that introduces this logs nobody out.

import { prisma } from '../../config/prisma.js';

/**
 * How long a cached version is trusted.
 *
 * Checking the database on every request would make revocation instant and put
 * a query in the hot path of every API call. Sixty seconds is the compromise: a
 * revoked token dies within a minute instead of within a week, at no per-request
 * cost. Where it matters more than that — the instance that performed the bump —
 * the cache entry is dropped immediately.
 *
 * NOTE: with more than one instance, another instance may honour a revoked token
 * for up to this long. The deployment runs a single replica (railway.json,
 * numReplicas: 1); if that changes, this cache has to move to the database or to
 * a shared store, and this comment is the reminder.
 */
const CACHE_MS = 60_000;

const cache = new Map<string, { version: number; at: number }>();

/** Drop a cached version — called by whatever just bumped it. */
export const forgetTokenVersion = (userId: string): void => {
  cache.delete(userId);
};

/** Test seam. */
export const clearTokenVersionCache = (): void => cache.clear();

/** The user's current token version, or null if the user no longer exists. */
export const currentTokenVersion = async (userId: string): Promise<number | null> => {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.version;

  const row = await prisma.user.findUnique({ where: { id: userId }, select: { tokenVersion: true } });
  // A deleted user is NOT cached: caching "null" would keep answering for a
  // minute after an account is recreated, and the safe answer is to look again.
  if (!row) return null;

  cache.set(userId, { version: row.tokenVersion, at: Date.now() });
  return row.tokenVersion;
};

/**
 * Does this token's version still match the user's?
 *
 * Fails CLOSED on a missing user — a token for an account that no longer exists
 * must stop working, which is the "deleted user" case the Phase 2 tests describe.
 * Fails OPEN on a database error, because the alternative is that a blip logs
 * every clinic out at once; the token was still validly signed and still expires
 * on its own.
 */
export const tokenVersionValid = async (userId: string, claimed: number | undefined): Promise<boolean> => {
  try {
    const current = await currentTokenVersion(userId);
    if (current === null) return false;
    // Absent claim === 0: tokens minted before this existed stay valid.
    return (claimed ?? 0) === current;
  } catch (err) {
    console.error('[auth] token version check failed — allowing the request', err);
    return true;
  }
};

/**
 * Invalidate every token this user holds. Returns the new version.
 *
 * Used by "sign out everywhere", and it is what a password change or a suspected
 * compromise should call.
 */
export const revokeAllSessions = async (userId: string): Promise<number> => {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
    select: { tokenVersion: true }
  });
  forgetTokenVersion(userId);
  return updated.tokenVersion;
};
