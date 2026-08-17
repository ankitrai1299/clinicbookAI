// Two-factor authentication, and ending sessions.
//
// MFA here is OPT-IN per user, not mandatory. That is a compromise with a stated
// reason rather than a soft default: the native MediScribe app is reproduced
// verbatim from its reference and its sign-in screen has no field for a code, so
// a user who enables MFA can no longer sign in on that app. Forcing it on
// everyone would lock every doctor using it out of the product.
//
// So: clinic owners and anyone using the dashboard can turn it on and should;
// doctors on the native app leave it off until that app can ask for a code. The
// login response for an MFA account is a 401 with a clear message, precisely so
// the app shows "enter your code on the web" instead of storing an undefined
// token and crashing — which is exactly how it failed once before.
//
// Enrolment is two steps on purpose. Generating a secret does NOT switch MFA on;
// the user must prove they can produce a code from it first. A one-step enrol
// would lock out anyone whose QR scan silently failed.

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { prisma } from '../../config/prisma.js';
import { verifyAccessToken } from '../../config/jwt.js';
import { requireAuth } from '../../middleware/auth.js';
import { authLimiter } from '../../middleware/rateLimiters.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError } from '../../utils/AppError.js';
import { record, recordFromRequest } from '../audit/audit.service.js';
import { completeMfaLogin } from './auth.service.js';
import { revokeAllSessions } from './session.service.js';
import { generateTotpSecret, totpUri, verifyTotp } from './totp.js';

const mfaRouter = Router();

const codeSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code') });

/**
 * POST /api/auth/mfa/verify — the second half of an MFA sign-in.
 *
 * Authenticated by the CHALLENGE token, not by a session: this is the one route
 * that accepts a `scope: 'mfa'` token, and requireAuth deliberately refuses it
 * everywhere else. Rate limited like every other credential endpoint, because
 * six digits is a small space to guess in.
 */
mfaRouter.post(
  '/verify',
  authLimiter,
  validate(codeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new AppError('Sign in again to continue', 401);

    let claims;
    try {
      claims = verifyAccessToken(header.slice(7).trim());
    } catch {
      // Five minutes have passed, or it is not ours. Either way: start over.
      throw new AppError('That sign-in attempt expired. Please sign in again.', 401);
    }
    if (claims.scope !== 'mfa') throw new AppError('Sign in again to continue', 401);

    const result = await completeMfaLogin(claims.userId, (req.body as { code: string }).code);

    record({
      clinicId: result.user.clinicId,
      actorId: result.user.id,
      actorType: 'user',
      actorRole: result.user.role,
      actorName: result.user.name,
      action: 'LOGIN',
      ip: req.ip ?? null,
      requestId: req.requestId ?? null,
      metadata: { mfa: true }
    });

    res.json({ success: true, message: 'Signed in', data: result });
  })
);

// Everything below needs a real session.
mfaRouter.use(requireAuth);

/**
 * POST /api/auth/mfa/setup — generate a secret and return the enrolment URI.
 *
 * Does NOT switch MFA on. The secret is stored so /enable can check a code
 * against it; until that succeeds, sign-in is unaffected.
 *
 * Re-running this replaces an unconfirmed secret, which is what someone who
 * lost the QR before scanning it needs. It refuses once MFA is ON, because
 * silently replacing a working secret would lock the user out of their own
 * account with no warning.
 */
mfaRouter.post(
  '/setup',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, mfaEnabled: true }
    });
    if (!existing) throw new AppError('Account not found', 404);
    if (existing.mfaEnabled) {
      throw new AppError('Two-factor authentication is already on. Turn it off first to set it up again.', 409);
    }

    const secret = generateTotpSecret();
    await prisma.user.update({ where: { id: userId }, data: { mfaSecret: secret, mfaEnabled: false } });

    res.json({
      success: true,
      data: {
        secret,
        // Rendered as a QR by the client. The secret is also returned so it can
        // be typed in by anyone whose camera will not cooperate.
        otpauthUrl: totpUri({ secret, account: existing.email })
      }
    });
  })
);

/** POST /api/auth/mfa/enable — confirm a code from the authenticator and switch it on. */
mfaRouter.post(
  '/enable',
  validate(codeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const row = await prisma.user.findUnique({ where: { id: userId }, select: { mfaSecret: true, mfaEnabled: true } });
    if (!row?.mfaSecret) throw new AppError('Start the setup first', 400);
    if (row.mfaEnabled) {
      res.json({ success: true, data: { mfaEnabled: true } });
      return;
    }

    if (!verifyTotp(row.mfaSecret, (req.body as { code: string }).code)) {
      throw new AppError('That code is not valid. Check the time on your phone and try again.', 400);
    }

    await prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true, mfaEnrolledAt: new Date() }
    });

    // Sessions are deliberately NOT revoked here: the user is standing at their
    // own screen turning security ON, and signing them out for it would teach
    // them that enabling MFA breaks things.
    recordFromRequest(req, { action: 'MFA_ENABLED', resourceType: 'user', resourceId: userId });

    res.json({ success: true, data: { mfaEnabled: true } });
  })
);

/**
 * POST /api/auth/mfa/disable — turn it off, with a current code.
 *
 * A code is required to switch it OFF as well as on. Otherwise anyone who
 * borrows an unlocked laptop can remove the second factor, which makes having
 * it not much better than not.
 */
mfaRouter.post(
  '/disable',
  validate(codeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const row = await prisma.user.findUnique({ where: { id: userId }, select: { mfaSecret: true, mfaEnabled: true } });
    if (!row?.mfaEnabled || !row.mfaSecret) {
      res.json({ success: true, data: { mfaEnabled: false } });
      return;
    }

    if (!verifyTotp(row.mfaSecret, (req.body as { code: string }).code)) {
      throw new AppError('That code is not valid.', 400);
    }

    await prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: false, mfaSecret: null, mfaEnrolledAt: null }
    });
    recordFromRequest(req, { action: 'MFA_DISABLED', resourceType: 'user', resourceId: userId });

    res.json({ success: true, data: { mfaEnabled: false } });
  })
);

/** GET /api/auth/mfa — is it on for me? */
mfaRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const row = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { mfaEnabled: true, mfaEnrolledAt: true }
    });
    res.json({ success: true, data: { mfaEnabled: row?.mfaEnabled ?? false, enrolledAt: row?.mfaEnrolledAt ?? null } });
  })
);

export default mfaRouter;

// ── Sessions ────────────────────────────────────────────────────────────────

export const sessionRouter = Router();

sessionRouter.use(requireAuth);

/**
 * POST /api/auth/sign-out-everywhere — invalidate every token this user holds.
 *
 * Including the one making the request: the caller has to sign in again, which
 * is the point. A lost phone, a shared computer, a suspected compromise — before
 * this there was no answer to any of them for up to seven days.
 */
sessionRouter.post(
  '/sign-out-everywhere',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const version = await revokeAllSessions(userId);

    recordFromRequest(req, {
      action: 'SESSIONS_REVOKED',
      resourceType: 'user',
      resourceId: userId,
      metadata: { newTokenVersion: version }
    });

    res.json({
      success: true,
      message: 'Signed out on every device. Please sign in again.',
      data: { tokenVersion: version }
    });
  })
);
