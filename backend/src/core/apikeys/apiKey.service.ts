// Public-API key issuance + resolution.
//
// A partner (hospital app, EMR, integrator) stores one of these keys in its own
// env and sends it on every /api/v1 call; the key is what tells us WHICH clinic
// the request belongs to. Resolution therefore happens BEFORE a tenant is known,
// so it uses the raw prisma client — exactly like WhatsAppChannel (see
// config/tenantScope.ts: ApiKey is deliberately not a TENANT_MODEL). Management
// calls (list/revoke) pass clinicId explicitly and are filtered on it.
//
// Only the sha256 HASH of the key is stored. The plaintext is returned ONCE at
// creation and never again. sha256 (not bcrypt) is correct here: the key is 192
// bits of CSPRNG entropy, so there is nothing to brute-force, and we need an
// O(1) indexed lookup by hash on every request. This is what Stripe/GitHub do.

import { createHash, randomBytes } from 'crypto';

import { prisma } from '../../config/prisma.js';
import { AppError } from '../../utils/AppError.js';

const KEY_PREFIX = 'ck_live_';
// Chars of the plaintext safe to store/display so a UI can identify a key.
const DISPLAY_PREFIX_LEN = KEY_PREFIX.length + 6;

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

export interface IssuedApiKey {
  id: string;
  name: string;
  prefix: string;
  /** Full key — shown ONCE, never retrievable again. */
  plaintext: string;
}

/** Mint a new key for a clinic. The plaintext is only ever returned from here. */
export const issueApiKey = async (clinicId: string, name: string): Promise<IssuedApiKey> => {
  const plaintext = KEY_PREFIX + randomBytes(24).toString('base64url');
  const prefix = plaintext.slice(0, DISPLAY_PREFIX_LEN);
  const row = await prisma.apiKey.create({
    data: { clinicId, name: name.trim(), keyHash: sha256(plaintext), prefix },
    select: { id: true }
  });
  return { id: row.id, name: name.trim(), prefix, plaintext };
};

export interface ResolvedApiKey {
  id: string;
  clinicId: string;
}

/**
 * Map a presented key to its clinic, or null if unknown/revoked. Constant work
 * regardless of validity (one hash + one indexed lookup) — no plaintext compare.
 */
export const resolveApiKey = async (plaintext: string): Promise<ResolvedApiKey | null> => {
  if (!plaintext.startsWith(KEY_PREFIX)) return null;
  const row = await prisma.apiKey.findUnique({
    where: { keyHash: sha256(plaintext) },
    select: { id: true, clinicId: true, revokedAt: true }
  });
  if (!row || row.revokedAt) return null;
  return { id: row.id, clinicId: row.clinicId };
};

// lastUsedAt is a coarse observability field with no correctness role, so it must
// not cost one row UPDATE (plus WAL record, dead tuple and index maintenance) per
// request. Without this throttle a polling partner serializes every request on the
// same ApiKey row's lock and, because the write is fire-and-forget, holds a
// connection-pool slot AFTER the response is sent. One write per key per window.
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const lastStamped = new Map<string, number>();

/** Fire-and-forget usage stamp, throttled per key; never blocks or fails a request. */
export const touchApiKey = (id: string): void => {
  const now = Date.now();
  const previous = lastStamped.get(id);
  if (previous !== undefined && now - previous < TOUCH_INTERVAL_MS) return;
  lastStamped.set(id, now);

  void prisma.apiKey
    .update({ where: { id }, data: { lastUsedAt: new Date(now) } })
    .catch((err: unknown) => console.error('[apikey] lastUsedAt update failed:', err));
};

/** Keys for a clinic — never exposes the hash or the plaintext. */
export const listApiKeys = (clinicId: string) =>
  prisma.apiKey.findMany({
    where: { clinicId },
    select: { id: true, name: true, prefix: true, lastUsedAt: true, revokedAt: true, createdAt: true },
    orderBy: { createdAt: 'desc' }
  });

/** Revoke (soft) a key. Scoped to the clinic so one tenant can't revoke another's. */
export const revokeApiKey = async (clinicId: string, id: string): Promise<void> => {
  const { count } = await prisma.apiKey.updateMany({
    where: { id, clinicId, revokedAt: null },
    data: { revokedAt: new Date() }
  });
  if (count === 0) throw new AppError('API key not found', 404);
};
