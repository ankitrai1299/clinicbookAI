import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';

// Guards the cross-system SSO endpoint. A trusted partner backend (e.g. the
// external NovaScribe on its own server) proves itself with a shared secret so it
// can verify a clinic's ClinicBook credentials on the clinic's behalf — WITHOUT
// the per-IP auth rate limit a browser login has (every partner call shares one
// server IP, so the normal limiter would throttle all clinics after ~20 logins).
//
// The secret lives in PARTNER_SSO_SECRET on BOTH systems. If it is unset here the
// endpoint is closed (fails every request), so enabling SSO is an explicit,
// deliberate act.

const safeEqual = (a: string, b: string): boolean => {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
};

export const requirePartnerSecret = (req: Request, res: Response, next: NextFunction): void => {
  const expected = process.env.PARTNER_SSO_SECRET;
  const provided = req.get('X-SSO-Secret') ?? '';
  if (!expected || !safeEqual(provided, expected)) {
    res.status(401).json({ success: false, message: 'Invalid or missing partner credentials' });
    return;
  }
  next();
};
