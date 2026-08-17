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

export const signAccessToken = (payload: JwtUserPayload) => {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn']
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
