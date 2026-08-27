// The ABDM gateway session token — the first thing every other ABDM call needs.
//
// ── The three headers, and why they are not optional ───────────────────────
//
// V3 needs REQUEST-ID, TIMESTAMP and X-CM-ID on every call, and gets them wrong
// in a way that costs hours if you do not know it:
//
//   X-CM-ID missing      → 401, not 400
//   REQUEST-ID not a UUID → 401, not 400
//
// Both look exactly like bad credentials. Working this out took a run of calls
// against the live sandbox: the same client id and secret returned 401 four
// times and 200 twice, and the only difference between them was X-CM-ID. So
// these headers are load-bearing, not ceremony, and a 401 from ABDM is far more
// likely to be a missing header than a wrong secret — check here first.
//
// (An earlier version of this file used /gateway/v0.5/sessions, on the strength
// of a single V3 401, with a comment asserting our bridge was registered
// against the older generation. That was wrong: the 401 was a malformed
// REQUEST-ID. V3 is the current standard and v0.5 is legacy, so building on
// v0.5 would have meant redoing the lot.)
//
// ── The token has to be cached ─────────────────────────────────────────────
//
// It is valid for hours and minting one is a network round-trip. Without
// caching, a single care-context link would spend two calls where it needs one,
// and a sync sweep would mint a token per record. The sandbox also rate-limits
// session creation — several rapid mints start failing — so caching is what
// keeps this working under load, not just what makes it quick.

import { randomUUID } from 'node:crypto';

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

/**
 * The headers ABDM V3 requires on EVERY call, session included.
 *
 * REQUEST-ID must be a UUID — anything else is rejected as unauthorised rather
 * than as malformed, so it is generated here and never taken from a caller.
 */
export const abdmHeaders = (): Record<string, string> => ({
  'REQUEST-ID': randomUUID(),
  TIMESTAMP: new Date().toISOString().replace(/\.\d{3}Z$/, '.000Z'),
  'X-CM-ID': env.ABDM_CM_ID
});

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
    `${env.ABDM_GATEWAY_BASE_URL}/api/hiecm/gateway/v3/sessions`,
    {
      clientId: env.ABDM_CLIENT_ID,
      clientSecret: env.ABDM_CLIENT_SECRET,
      grantType: 'client_credentials'
    },
    {
      headers: { 'Content-Type': 'application/json', ...abdmHeaders() },
      timeout: 20_000
    }
  );

  const token = data?.accessToken;
  if (!token) throw new Error('ABDM gateway returned no accessToken');

  cached = { token, expiresAt: expiryFrom(data?.expiresIn, now) };
  return token;
};

/**
 * An axios client already carrying the session token and the required headers.
 *
 * `Authorization: Bearer <token>` is the only accepted form — a raw token, or
 * the same token under X-Token, comes back 900902 "Missing Credentials", which
 * reads like bad credentials rather than a bad header.
 *
 * REQUEST-ID is stamped per REQUEST, not once per client: it identifies the
 * call, and reusing one across calls is what makes a gateway trace impossible
 * to follow when something goes wrong.
 */
export const abdmClient = async (): Promise<AxiosInstance> => {
  const token = await getGatewayToken();
  const client = axios.create({
    baseURL: env.ABDM_GATEWAY_BASE_URL,
    timeout: 30_000,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      accept: 'application/json'
    }
  });
  client.interceptors.request.use((config) => {
    Object.assign(config.headers, abdmHeaders());
    return config;
  });
  return client;
};

/** Drop the cached token. For tests, and for a forced re-auth after a 401. */
export const resetGatewayToken = (): void => {
  cached = null;
};
