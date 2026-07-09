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
import { ApiKeyMode } from '@prisma/client';

import { prisma } from '../../config/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { ensureSandboxClinic, findSandboxClinic } from './sandbox.service.js';

// The prefix is part of the key's contract: it tells a partner at a glance which
// world a leaked key can touch, and lets resolveApiKey reject garbage before it
// hashes anything.
const KEY_PREFIX: Record<ApiKeyMode, string> = {
  [ApiKeyMode.LIVE]: 'ck_live_',
  [ApiKeyMode.TEST]: 'ck_test_'
};
// Chars of the plaintext safe to store/display so a UI can identify a key.
const DISPLAY_EXTRA_CHARS = 6;

/** Coarse permissions. Ordered least → most privileged for display. */
export const API_SCOPES = ['read', 'write'] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export const isApiScope = (value: string): value is ApiScope => (API_SCOPES as readonly string[]).includes(value);

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

export interface IssuedApiKey {
  id: string;
  name: string;
  prefix: string;
  mode: ApiKeyMode;
  scopes: ApiScope[];
  /** The sandbox clinic a TEST key acts on; equals clinicId for a LIVE key. */
  clinicId: string;
  /** Full key — shown ONCE, never retrievable again. */
  plaintext: string;
}

/**
 * Mint a new key. The plaintext is only ever returned from here.
 *
 * A TEST key is deliberately bound to the clinic's SANDBOX twin, not to the real
 * clinic: that is the whole isolation mechanism. Every downstream query is tenant
 * scoped by `resolveApiKey`'s clinicId, so nothing else has to know about modes.
 */
export const issueApiKey = async (
  realClinicId: string,
  name: string,
  opts: { mode?: ApiKeyMode; scopes?: ApiScope[] } = {}
): Promise<IssuedApiKey> => {
  const mode = opts.mode ?? ApiKeyMode.LIVE;
  const scopes = opts.scopes?.length ? [...new Set(opts.scopes)] : [...API_SCOPES];

  const clinicId = mode === ApiKeyMode.TEST ? await ensureSandboxClinic(realClinicId) : realClinicId;

  const plaintext = KEY_PREFIX[mode] + randomBytes(24).toString('base64url');
  const prefix = plaintext.slice(0, KEY_PREFIX[mode].length + DISPLAY_EXTRA_CHARS);
  const row = await prisma.apiKey.create({
    data: { clinicId, name: name.trim(), keyHash: sha256(plaintext), prefix, mode, scopes },
    select: { id: true }
  });
  return { id: row.id, name: name.trim(), prefix, mode, scopes, clinicId, plaintext };
};

export interface ResolvedApiKey {
  id: string;
  clinicId: string;
  mode: ApiKeyMode;
  scopes: ApiScope[];
}

/**
 * Map a presented key to its clinic, or null if unknown/revoked. Constant work
 * regardless of validity (one hash + one indexed lookup) — no plaintext compare.
 */
export const resolveApiKey = async (plaintext: string): Promise<ResolvedApiKey | null> => {
  const known = Object.values(KEY_PREFIX).some((p) => plaintext.startsWith(p));
  if (!known) return null;

  const row = await prisma.apiKey.findUnique({
    where: { keyHash: sha256(plaintext) },
    select: { id: true, clinicId: true, revokedAt: true, mode: true, scopes: true }
  });
  if (!row || row.revokedAt) return null;
  return { id: row.id, clinicId: row.clinicId, mode: row.mode, scopes: row.scopes.filter(isApiScope) };
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

/**
 * Every clinicId a dashboard user owns: their clinic, plus its sandbox twin if
 * one exists. TEST keys are stored against the SANDBOX's id, so listing/revoking
 * by the real clinicId alone would silently hide them — and, worse, make "Revoke"
 * fail with a 404 on exactly the keys a developer most wants to rotate.
 * Both management calls below filter on this set, so a tenant can still never
 * see or revoke another tenant's keys.
 */
const ownedClinicIds = async (realClinicId: string): Promise<string[]> => {
  const sandbox = await findSandboxClinic(realClinicId);
  return sandbox ? [realClinicId, sandbox.id] : [realClinicId];
};

/** Keys for a clinic and its sandbox — never exposes the hash or the plaintext. */
export const listApiKeys = async (realClinicId: string) =>
  prisma.apiKey.findMany({
    where: { clinicId: { in: await ownedClinicIds(realClinicId) } },
    select: {
      id: true,
      name: true,
      prefix: true,
      mode: true,
      scopes: true,
      lastUsedAt: true,
      revokedAt: true,
      createdAt: true
    },
    orderBy: { createdAt: 'desc' }
  });

/** Revoke (soft) a key. Scoped to the clinic so one tenant can't revoke another's. */
export const revokeApiKey = async (realClinicId: string, id: string): Promise<void> => {
  const { count } = await prisma.apiKey.updateMany({
    where: { id, clinicId: { in: await ownedClinicIds(realClinicId) }, revokedAt: null },
    data: { revokedAt: new Date() }
  });
  if (count === 0) throw new AppError('API key not found', 404);
};
