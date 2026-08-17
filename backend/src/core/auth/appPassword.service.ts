// App passwords: one credential per device, for clients that cannot ask for a
// second factor.
//
// The full reasoning is on the AppPassword model in schema.prisma. The short
// version: the native scribe app is reproduced verbatim and has no field for a
// 6-digit code, so without this MFA would never be switched on at all.
//
// Three properties do the work:
//
//   RECOGNISABLE — every one starts `msk_`, so sign-in can tell in one character
//   comparison whether to look here at all, and a doctor can tell at a glance
//   that the thing in their password manager is a device password and not their
//   real one.
//
//   HASHED, NOT ENCRYPTED — sha256, like ApiKey. The credential is 160 bits of
//   randomness, so bcrypt's slowness protects nothing that entropy has not
//   already protected, and a hash lookup keeps sign-in at one indexed query.
//
//   REVOCABLE ALONE — losing a phone revokes that phone, not the account.

import { createHash, randomBytes } from 'crypto';

import { prisma } from '../../config/prisma.js';

/** Every app password starts with this, so sign-in can recognise one instantly. */
export const APP_PASSWORD_PREFIX = 'msk_';

/** Shown in the list so a device can be identified without revealing the secret. */
const DISPLAY_CHARS = APP_PASSWORD_PREFIX.length + 6;

/**
 * How many a user may hold at once.
 *
 * Not a security limit — it is a hygiene one. A list nobody prunes is a list
 * nobody reads, and an unreadable list is how a revoked device stays signed in.
 */
export const MAX_APP_PASSWORDS = 10;

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/** `msk_` + 32 hex characters (160 bits). */
const generate = (): string => `${APP_PASSWORD_PREFIX}${randomBytes(20).toString('hex')}`;

export const looksLikeAppPassword = (value: string): boolean =>
  (value || '').startsWith(APP_PASSWORD_PREFIX);

export interface IssuedAppPassword {
  id: string;
  name: string;
  prefix: string;
  /** Returned ONCE, at creation. Never stored, never retrievable again. */
  plaintext: string;
}

/** Mint one for a device. */
export const issueAppPassword = async (
  userId: string,
  clinicId: string,
  name: string
): Promise<IssuedAppPassword> => {
  const active = await prisma.appPassword.count({ where: { userId, revokedAt: null } });
  if (active >= MAX_APP_PASSWORDS) {
    throw new Error(`You already have ${MAX_APP_PASSWORDS} device passwords. Revoke one you no longer use first.`);
  }

  const plaintext = generate();
  const row = await prisma.appPassword.create({
    data: {
      userId,
      clinicId,
      name: name.trim(),
      hash: sha256(plaintext),
      prefix: plaintext.slice(0, DISPLAY_CHARS)
    },
    select: { id: true, name: true, prefix: true }
  });

  return { ...row, plaintext };
};

/**
 * Resolve a submitted password to the app password it is, if any.
 *
 * Returns the owning userId, or null. A single indexed lookup regardless of
 * whether the value is valid — no comparison loop, and no timing difference
 * between "wrong" and "revoked".
 *
 * `lastUsedAt` is stamped so the Security tab can show which devices are still
 * in use, which is what makes pruning the list possible.
 */
export const resolveAppPassword = async (plaintext: string): Promise<{ userId: string; id: string } | null> => {
  if (!looksLikeAppPassword(plaintext)) return null;

  const row = await prisma.appPassword.findUnique({
    where: { hash: sha256(plaintext) },
    select: { id: true, userId: true, revokedAt: true }
  });
  if (!row || row.revokedAt) return null;

  // Fire-and-forget: a failed stamp must never fail a sign-in.
  void prisma.appPassword
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);

  return { userId: row.userId, id: row.id };
};

/** This user's device passwords. Never exposes the hash or the plaintext. */
export const listAppPasswords = (userId: string) =>
  prisma.appPassword.findMany({
    where: { userId, revokedAt: null },
    select: { id: true, name: true, prefix: true, lastUsedAt: true, createdAt: true },
    orderBy: { createdAt: 'desc' }
  });

/**
 * Revoke one. Scoped to the owner, so an id copied from elsewhere revokes
 * nothing.
 */
export const revokeAppPassword = async (userId: string, id: string): Promise<boolean> => {
  const { count } = await prisma.appPassword.updateMany({
    where: { id, userId, revokedAt: null },
    data: { revokedAt: new Date() }
  });
  return count > 0;
};
