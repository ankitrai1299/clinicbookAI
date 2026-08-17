// Audio upload middleware for the MediScribe port.
//
// This exists as its own module for one reason: multer LOSES the tenant context.
//
// `bridgeAuth` binds the clinic into an AsyncLocalStorage before the route runs.
// That store propagates through awaits, so every ordinary handler sees it. Multer
// is different — it consumes the request stream and calls `next()` from a stream
// event, and stream events run in the async context of the socket, which was
// created by the HTTP server long BEFORE any of our middleware. So the handler
// after `upload.single()` runs with an EMPTY store, and the first repository call
// throws "[mediscribe] no clinic context".
//
// Symptom, before this: every screen worked except recording/uploading audio.
//
// The fix is to re-enter the context on the way out of multer. Nothing may use
// the raw multer instance directly — that is why it is private to this file.

import multer from 'multer';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

import { runWithClinic } from '../context.js';

/** 25 MB ceiling — matches the client-side limit for uploaded audio files. */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_AUDIO_BYTES } });

/** ClinicBook's requireAuth attaches this; it is a plain property multer cannot disturb. */
interface WithUser {
  user?: { clinicId?: string };
}

/**
 * `upload.single(field)`, with the tenant context restored afterwards.
 *
 * The clinic is read back from `req.user` (set by ClinicBook's requireAuth
 * upstream) rather than from the store, because by this point the store is
 * exactly what has gone missing. A request that somehow arrives without one is
 * passed straight through: `currentClinicId()` will then throw as it always
 * did, which is the correct outcome — better a loud failure than an upload
 * silently landing in another clinic's records.
 */
export const uploadAudio =
  (field: string): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    const clinicId = (req as Request & WithUser).user?.clinicId;
    upload.single(field)(req, res, (err?: unknown) => {
      if (err) return next(err);
      if (!clinicId) return next();
      runWithClinic(clinicId, () => next());
    });
  };
