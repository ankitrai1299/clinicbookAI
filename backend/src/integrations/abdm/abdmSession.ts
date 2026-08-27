// The ABDM gateway session token — the first thing every other ABDM call needs.
//
// ── Which endpoint, and why not the one in the docs ────────────────────────
//
// NHA's onboarding mail points at the V3 documentation, and V3 has its own
// session endpoint at /api/hiecm/gateway/v3/sessions. Tried against the bridge
// credentials we were issued, that returns 401; /gateway/v0.5/sessions returns
// a token for the same credentials. A bridge is registered against one API
// generation, and ours is the older one — so the version here is a fact about
// our registration, not a preference, and it must not be "upgraded" to V3
// without re-testing against the real gateway.
//
// ── The token has to be cached ─────────────────────────────────────────────
//
// It is valid for a long time (hours) and minting one is a network round-trip.
// Without caching, a single care-context link would spend two calls where it
// needs one, and a sync sweep would mint a token per record.

import axios, { AxiosInstance } from 'axios';

import { env } from '../../config/env.js';

/** The gateway rejects a token at its exact expiry, so retire it early. */
const EXPIRY_MARGIN_MS = 60_000;

interface CachedToken {
  token: string;
  /** Epoch ms at which this stops being usable. */
  expiresAt: number;
}

let cached: CachedToken | null = null;

/**
 * PURE: is a cached token still worth using at this instant?
 *
 * Split out from the fetching so the margin is testable without a gateway. The
 * margin matters more than it looks: a token that expires mid-request fails the
 * call, and the caller has no way to tell that from a genuine rejection.
 */
export const tokenIsUsable = (entry: CachedToken | null, now: number): boolean =>
  entry !== null && entry.expiresAt - EXPIRY_MARGIN_MS > now;

/** PURE: when does a token minted now, with this lifetime, stop being usable? */
export const expiryFrom = (expiresInSeconds: number | undefined, now: number): number => {
  // The gateway does not always send expiresIn. Half an hour is well inside
  // every documented lifetime, so a missing value costs an extra mint, never a
  // request made with a dead token.
  const FALLBACK_SECONDS = 1800;
  const seconds =
    typeof expiresInSeconds === 'number' && expiresInSeconds > 0 ? expiresInSeconds : FALLBACK_SECONDS;
  return now + seconds * 1000;
};

export class AbdmNotConfigured extends Error {
  constructor() {
    super('ABDM is not configured (ABDM_CLIENT_ID / ABDM_CLIENT_SECRET are unset).');
  }
}

/** Whether ABDM can be talked to at all. Every caller checks this first. */
export const isAbdmConfigured = (): boolean =>
  Boolean(env.ABDM_CLIENT_ID && env.ABDM_CLIENT_SECRET);

/**
 * A gateway session token, minted or reused.
 *
 * Throws AbdmNotConfigured rather than returning null, because every call site
 * needs a token to proceed — a null would only be checked and rethrown.
 */
export const getGatewayToken = async (now = Date.now()): Promise<string> => {
  if (!isAbdmConfigured()) throw new AbdmNotConfigured();
  if (tokenIsUsable(cached, now)) return cached!.token;

  const { data } = await axios.post(
    `${env.ABDM_GATEWAY_BASE_URL}/gateway/v0.5/sessions`,
    { clientId: env.ABDM_CLIENT_ID, clientSecret: env.ABDM_CLIENT_SECRET },
    { headers: { 'Content-Type': 'application/json' }, timeout: 20_000 }
  );

  const token = data?.accessToken;
  if (!token) throw new Error('ABDM gateway returned no accessToken');

  cached = { token, expiresAt: expiryFrom(data?.expiresIn, now) };
  return token;
};

/**
 * An axios client already carrying the session token.
 *
 * `Authorization: Bearer <token>` is the only form the gateway accepts — a raw
 * token, or the same token under X-Token, comes back 900902 "Missing
 * Credentials", which reads like bad credentials rather than a bad header.
 */
export const abdmClient = async (): Promise<AxiosInstance> => {
  const token = await getGatewayToken();
  return axios.create({
    baseURL: env.ABDM_GATEWAY_BASE_URL,
    timeout: 30_000,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      accept: 'application/json'
    }
  });
};

/** Drop the cached token. For tests, and for a forced re-auth after a 401. */
export const resetGatewayToken = (): void => {
  cached = null;
};
