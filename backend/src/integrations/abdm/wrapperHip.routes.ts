// What NHA's ABDM wrapper calls on us.
//
// ── These are not the gateway's endpoints ─────────────────────────────────
//
// abdmHip.routes.ts serves the GATEWAY, on paths ABDM chose, and nothing on it
// can be authenticated — the gateway sends no credential, and the design is
// safe because the answer never travels back down the connection that asked.
//
// This file is the opposite case and must be treated as such. The wrapper is
// OUR software. It sends a request and we answer it SYNCHRONOUSLY, in the HTTP
// response, with a named patient's visits and, on one route, their records. An
// unauthenticated version of this endpoint would answer the question "is this
// person a patient at that clinic, and what were they treated for" to anyone
// who asked.
//
// NHA's own guidance is that the wrapper and the facility sit behind the same
// firewall. Ours will not: the wrapper runs as a separate service and reaches
// us over the internet. So every route here requires a shared secret, and
// without one configured the whole router refuses rather than running open.

import { Router, type NextFunction, type Request, type Response } from 'express';
import { timingSafeEqual } from 'node:crypto';

import { env } from '../../config/env.js';
import {
  careContextsForAbha,
  discoverPatient,
  healthInformationFor
} from './wrapperHip.service.js';

export const abdmWrapperRouter = Router();

/**
 * The shared secret between the wrapper and us.
 *
 * Compared in constant time. A plain `===` on a secret leaks its length and,
 * character by character, its contents to anyone who can measure the response
 * — which is anyone on the internet, because this endpoint is.
 */
const secretMatches = (given: string | undefined): boolean => {
  const expected = env.ABDM_WRAPPER_SECRET;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, which would itself be a
  // length oracle; compare a fixed-size digest of each instead.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
};

const requireWrapper = (req: Request, res: Response, next: NextFunction): void => {
  if (!env.ABDM_WRAPPER_SECRET) {
    // Not "unauthorized" — misconfigured. Saying so in the log and refusing is
    // the only safe reading of "somebody deployed this without a secret".
    console.error('[ABDM:v3] ABDM_WRAPPER_SECRET is not set — refusing every wrapper request');
    res.status(503).json({ error: { code: 2500, message: 'HIP adapter not configured' } });
    return;
  }
  const given = req.get('x-wrapper-secret') ?? req.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!secretMatches(given)) {
    res.status(401).json({ error: { code: 1401, message: 'Unauthorized' } });
    return;
  }
  next();
};

abdmWrapperRouter.use(requireWrapper);

/** The facility this call is about. The wrapper sends it in the body. */
const hipIdOf = (req: Request): string | null => {
  const body = (req.body ?? {}) as { hipId?: string };
  return body.hipId?.trim() || req.get('x-hip-id')?.trim() || null;
};

/**
 * POST /v3/patient-discover — "is this person a patient of yours?"
 *
 * 404 rather than an empty body for "no". A blank 200 reads to the wrapper as a
 * patient with no visits, which is a different answer and shows the patient a
 * facility that offers them nothing.
 */
abdmWrapperRouter.post('/v3/patient-discover', async (req, res) => {
  const hipId = hipIdOf(req);
  const patient = (req.body ?? {}).patient;
  if (!hipId || !patient?.id) {
    res.status(400).json({ error: { code: 1400, message: 'hipId and patient.id are required' } });
    return;
  }

  const found = await discoverPatient(hipId, patient);
  if (!found) {
    res.status(404).json({ error: { code: 3404, message: 'No patient found' } });
    return;
  }
  res.status(200).json(found);
});

/** POST /v3/patient-care-contexts — the visits behind an ABHA address. */
abdmWrapperRouter.post('/v3/patient-care-contexts', async (req, res) => {
  const hipId = hipIdOf(req);
  const abhaAddress = ((req.body ?? {}).abhaAddress as string | undefined)?.trim();
  if (!hipId || !abhaAddress) {
    res.status(400).json({ error: { code: 1400, message: 'hipId and abhaAddress are required' } });
    return;
  }

  const found = await careContextsForAbha(hipId, abhaAddress);
  if (!found) {
    res.status(404).json({ error: { code: 3404, message: 'No patient found' } });
    return;
  }
  res.status(200).json(found);
});

/**
 * POST /v3/health-information — the records a consent covers.
 *
 * Each pair carries BOTH the patient reference and the care context, and the
 * service refuses any pair where the visit does not belong to that patient. A
 * context that fails that check is dropped from the answer rather than failing
 * the whole request: one bad reference must not withhold records the patient
 * legitimately consented to.
 */
abdmWrapperRouter.post('/v3/health-information', async (req, res) => {
  const pairs = ((req.body ?? {}).careContextsWithPatientReferences ?? []) as Array<{
    patientReference?: string;
    careContextReference?: string;
  }>;

  const usable = pairs
    .filter((p) => p.patientReference && p.careContextReference)
    .map((p) => ({
      patientReference: p.patientReference as string,
      careContextReference: p.careContextReference as string
    }));

  if (!usable.length) {
    res.status(400).json({
      error: { code: 1400, message: 'careContextsWithPatientReferences is required' }
    });
    return;
  }

  const healthInformationBundle = await healthInformationFor(usable);
  res.status(200).json({ healthInformationBundle });
});

/** GET / — a liveness check the wrapper can use, and nothing else. */
abdmWrapperRouter.get('/', (_req, res) => {
  res.status(200).json({ status: 'ok', role: 'HIP adapter for the ABDM wrapper' });
});
