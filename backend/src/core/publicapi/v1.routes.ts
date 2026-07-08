// ===========================================================================
// PUBLIC API v1 — the surface a partner system (hospital app, EMR, integrator)
// calls with its own API key. This is the INBOUND direction: they integrate with
// us, we don't reach into them.
//
// Every handler reads through `dataSourceFor(req.clinic.id)`, so the SAME
// endpoint serves a clinic whose data lives in our Postgres (native mode) AND a
// clinic whose data lives in its EMR (EMR mode). The caller cannot tell — and
// must not need to.
//
// Versioned on purpose: /api/v1 is a public contract. Breaking changes go to v2.
// ===========================================================================

import { Router } from 'express';

import { prisma } from '../../config/prisma.js';
import { requireApiKey } from '../../middleware/apiKeyAuth.js';
import { apiKeyLimiter } from '../../middleware/rateLimiters.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError } from '../../utils/AppError.js';
import { dataSourceFor } from '../datasource/index.js';
import { getAvailableSlots } from '../../services/scheduling.service.js';

const router = Router();

// Every /api/v1 route is key-authenticated and tenant-bound, then rate-limited
// PER KEY (not per IP — see rateLimiters.ts). Order matters: the limiter needs
// req.apiKey.id, which requireApiKey sets.
router.use(requireApiKey);
router.use(apiKeyLimiter);

const clinicId = (req: { clinic?: { id: string } }): string => req.clinic!.id;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/v1/me
 * Who am I? Lets an integrator verify their key works before wiring anything.
 */
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId(req) },
      select: { id: true, name: true }
    });
    if (!clinic) throw new AppError('Clinic not found', 404);
    res.status(200).json({ success: true, data: { clinicId: clinic.id, clinicName: clinic.name } });
  })
);

/**
 * GET /api/v1/doctors
 * The clinic's bookable doctors. Native clinics: from our DB. EMR clinics:
 * live from their EMR (shadow-mirrored), returned with the same local ids.
 */
router.get(
  '/doctors',
  asyncHandler(async (req, res) => {
    const doctors = await dataSourceFor(clinicId(req)).doctors.listRefs();
    res.status(200).json({ success: true, data: doctors });
  })
);

/**
 * GET /api/v1/doctors/:id/slots?date=YYYY-MM-DD
 * Open appointment start times for that doctor on that date, in clinic-local
 * "HH:MM AM/PM". Past/near-past slots are already filtered out.
 */
router.get(
  '/doctors/:id/slots',
  asyncHandler(async (req, res) => {
    const date = String(req.query.date ?? '');
    if (!DATE_RE.test(date)) {
      throw new AppError('Query param `date` is required as YYYY-MM-DD.', 400);
    }
    const slots = await getAvailableSlots(clinicId(req), req.params.id, date);
    res.status(200).json({ success: true, data: { doctorId: req.params.id, date, slots } });
  })
);

export default router;
