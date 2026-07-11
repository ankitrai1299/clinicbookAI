// Patient 360 — one endpoint keyed by the patient ID (internal cuid OR the
// human-friendly Patient Code, PT-XXXX) that returns EVERYTHING about a patient
// in one place: profile + booking history + consultation notes & prescriptions +
// active medicine reminders. The aggregation lives in services/patient360.service
// (shared with the WhatsApp record skill and the dashboards). Clinic-scoped.

import { Router, type Request, type Response } from 'express';

import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { getPatientRecord } from '../services/patient360.service.js';

const router = Router();

const clinicOf = (req: Request): string => {
  const clinicId = (req as Request & { user?: { clinicId?: string } }).user?.clinicId;
  if (!clinicId) throw new AppError('Authentication required', 401);
  return clinicId;
};

// GET /api/patient-record/:idOrCode — the full 360 record for one patient.
router.get(
  '/:idOrCode',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const record = await getPatientRecord(clinicOf(req), String(req.params.idOrCode || ''));
    if (!record) throw new AppError('Patient not found', 404);
    res.json({ success: true, data: record });
  })
);

export default router;
