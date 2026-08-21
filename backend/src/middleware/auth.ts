import { NextFunction, Request, Response } from 'express';

import { verifyAccessToken } from '../config/jwt.js';
import { tokenVersionValid } from '../core/auth/session.service.js';
import { AppError } from '../utils/AppError.js';

export const requireAuth = (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    return next(new AppError('Authentication required', 401));
  }

  const token = header.slice(7).trim();

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    return next(new AppError('Invalid or expired token', 401));
  }

  // There used to be a hard refusal here for any token whose role was 'DOCTOR'.
  // It guarded the deleted doctor portal, whose tokens carried a doctorId in
  // `userId` — not a real User — and had to be kept out of the clinic API.
  //
  // DOCTOR is now a real account role, so that line would have rejected every
  // genuine doctor with "Invalid token for this resource" and made the login look
  // broken for exactly the people this change is for.
  //
  // Removing it is safe on its own terms: no portal token can be minted any more
  // (the code is gone), and one that somehow survived is refused a few lines
  // below anyway — the revocation check looks the user up, finds no such User,
  // and returns 401. Where a doctor may actually GO is decided by the permission
  // matrix and core/authz/surfaces.ts, not by refusing them a session.

  // Half-authenticated: the password was right, the second factor was not given.
  // Only the MFA verification route accepts one of these; everything else must
  // treat it as no session at all.
  if (payload.scope === 'mfa') {
    return next(new AppError('Two-factor authentication is required to continue', 401));
  }

  // Revocation. A signed, unexpired token is not enough on its own any more:
  // signing out everywhere, changing a password, or deleting the account bumps
  // the user's version and every token they hold stops working.
  //
  // Async, so this middleware now defers rather than calling next() inline —
  // the version is cached, so in the common case this costs no query.
  void tokenVersionValid(payload.userId, payload.tv).then(
    (valid) => {
      if (!valid) {
        return next(new AppError('This session has been signed out. Please sign in again.', 401));
      }
      req.user = payload;
      return next();
    },
    (err) => next(err)
  );
};
