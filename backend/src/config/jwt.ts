import jwt, { SignOptions } from 'jsonwebtoken';

import { env } from './env.js';

export interface JwtUserPayload {
  userId: string;
  clinicId: string;
  email: string;
  role: string;
  /**
   * Token version. Bumping the user's version invalidates every token they hold
   * (see core/auth/session.service.ts).
   *
   * OPTIONAL, and absent means 0. Every token issued before this claim existed
   * therefore stays valid against a user whose tokenVersion defaults to 0 — the
   * deploy that adds revocation does not log anybody out.
   */
  tv?: number;
  /**
   * Set to 'mfa' on the short-lived token issued between password and second
   * factor. Such a token proves the password only: requireAuth rejects it, and
   * the ONLY endpoint that accepts it is the MFA verification one.
   */
  scope?: 'mfa';
}

/**
 * How long an access token may live, by role.
 *
 * These two numbers are not ours to choose. NDHM's Secure Application
 * Development Reference Document, §3.1.2 Requirement 2, sets them:
 *
 *   "The default token lifetime for application administrative users must not
 *    exceed 12 hours, and for general users, must not exceed 30 hours."
 *
 * We were issuing SEVEN DAYS to everyone — 168 hours, fourteen times the
 * administrative limit — which an ABDM security audit reads straight off this
 * requirement. The cost of complying is that an owner signs in each morning.
 */
const ADMIN_TOKEN_HOURS = 12;
const USER_TOKEN_HOURS = 30;

/** Roles that hold the keys to the clinic, and therefore the shorter life. */
const ADMIN_ROLES = new Set(['superadmin', 'hospital_admin', 'admin', 'CLINIC_ADMIN', 'SUPER_ADMIN']);

/** PURE: the ceiling for this role, in hours. */
export const tokenHoursFor = (role: string | null | undefined): number =>
  ADMIN_ROLES.has(String(role ?? '')) ? ADMIN_TOKEN_HOURS : USER_TOKEN_HOURS;

/**
 * PURE: the lifetime to sign with.
 *
 * `JWT_EXPIRES_IN` is still honoured, but only ever to SHORTEN. A deployment
 * that wants tighter sessions can set it; one that sets 7d — as ours did — gets
 * the limit instead of the request, because an environment variable cannot
 * raise a ceiling somebody else wrote.
 */
export const accessTokenExpiry = (role: string | null | undefined, configured = env.JWT_EXPIRES_IN): string => {
  const cap = tokenHoursFor(role);
  const m = /^(\d+)\s*([hd])$/.exec(String(configured ?? '').trim());
  if (!m) return `${cap}h`;

  const hours = Number(m[1]) * (m[2] === 'd' ? 24 : 1);
  return hours > 0 && hours < cap ? `${hours}h` : `${cap}h`;
};

export const signAccessToken = (payload: JwtUserPayload) => {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: accessTokenExpiry(payload.role) as SignOptions['expiresIn']
  });
};

/**
 * The half-authenticated token handed out when a password is correct but the
 * second factor has not been given yet.
 *
 * Five minutes: long enough to open an authenticator app and type six digits,
 * short enough that leaving it on a shared screen is not a session.
 */
export const signMfaChallengeToken = (payload: Omit<JwtUserPayload, 'scope'>) =>
  jwt.sign({ ...payload, scope: 'mfa' } satisfies JwtUserPayload, env.JWT_SECRET, { expiresIn: '5m' });

export const verifyAccessToken = (token: string) => {
  return jwt.verify(token, env.JWT_SECRET) as JwtUserPayload;
};
