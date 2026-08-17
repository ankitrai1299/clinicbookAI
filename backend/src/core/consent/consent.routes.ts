// Recording and reading consent from the dashboard and the scribe.
//
// The WhatsApp path (notice + STOP) is the patient's own voice and lives in
// whatsappConsent.ts. This router is the other half: consent captured by a
// PERSON at the clinic — a doctor confirming the patient was told the visit is
// being recorded, or staff withdrawing consent because the patient asked at the
// desk.
//
// Both write the same table and both land in the same audit trail, so "how was
// this consent obtained?" is answerable from one place regardless of which door
// it came through.

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError } from '../../utils/AppError.js';
import { requirePermission } from '../authz/requirePermission.js';
import {
  CONSENT_PURPOSES,
  grantConsent,
  withdrawConsent,
  type ConsentPurpose
} from './consent.service.js';
import { prisma } from '../../config/prisma.js';
import { NOTICE_VERSION } from './notice.js';

const consentRouter = Router();

consentRouter.use(requireAuth);

const clinicOf = (req: Request): string => {
  const clinicId = req.user?.clinicId;
  if (!clinicId) throw new AppError('Authentication required', 401);
  return clinicId;
};

// 'privacy_notice' is excluded: it records that the notice was SHOWN, which only
// the system does. Letting a client write it would let a clinic mark patients as
// notified without ever having sent anything.
const grantablePurposes = CONSENT_PURPOSES.filter((p) => p !== 'privacy_notice') as [ConsentPurpose, ...ConsentPurpose[]];

export const recordConsentSchema = z.object({
  patientId: z.string().trim().min(1),
  purpose: z.enum(grantablePurposes),
  /** How it was obtained. Short, non-clinical. */
  evidence: z.string().trim().max(200).optional()
});

const patientParamsSchema = z.object({ patientId: z.string().trim().min(1) });
const withdrawParamsSchema = z.object({
  patientId: z.string().trim().min(1),
  purpose: z.enum(grantablePurposes)
});

/** GET /api/consent/:patientId — what this patient has agreed to, and when. */
consentRouter.get(
  '/:patientId',
  requirePermission('patient.read'),
  validate(patientParamsSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) => {
    const clinicId = clinicOf(req);
    const rows = await prisma.patientConsent.findMany({
      where: { clinicId, patientId: req.params.patientId },
      select: {
        purpose: true,
        status: true,
        noticeVersion: true,
        channel: true,
        evidence: true,
        grantedAt: true,
        withdrawnAt: true,
        updatedAt: true
      }
    });

    res.json({
      success: true,
      data: {
        currentNoticeVersion: NOTICE_VERSION,
        consents: rows,
        // A purpose with no row has never been asked about — which is a different
        // thing from having been refused, and the UI must be able to tell them
        // apart.
        missing: grantablePurposes.filter((p) => !rows.some((r) => r.purpose === p))
      }
    });
  })
);

/**
 * POST /api/consent — record that a patient agreed to something.
 *
 * Requires `consultation.write` rather than `patient.update`: the realistic
 * caller is a doctor confirming, before recording, that they told the patient.
 * A receptionist has no basis on which to assert that a patient consented to a
 * consultation being recorded — they were not in the room.
 */
consentRouter.post(
  '/',
  requirePermission('consultation.write'),
  validate(recordConsentSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const clinicId = clinicOf(req);
    const body = req.body as z.infer<typeof recordConsentSchema>;

    const patient = await prisma.patient.findFirst({
      where: { id: body.patientId, clinicId },
      select: { id: true, phone: true }
    });
    // Scoped by clinic, so a patient id copied from another tenant reads as
    // "not found" rather than writing a consent row into the wrong clinic.
    if (!patient) throw new AppError('Patient not found', 404);

    await grantConsent({
      clinicId,
      patientId: patient.id,
      purpose: body.purpose,
      channel: 'web',
      phone: patient.phone,
      evidence: body.evidence || 'confirmed in the app',
      actorId: req.user?.userId ?? null,
      actorRole: req.user?.role ?? null
    });

    res.status(201).json({ success: true, data: { patientId: patient.id, purpose: body.purpose } });
  })
);

/**
 * DELETE /api/consent/:patientId/:purpose — withdraw on the patient's behalf.
 *
 * A patient who asks at the front desk to stop getting messages must be able to
 * have that honoured without being asked to text STOP. Front-desk staff can do
 * this (patient.update) because it only ever REMOVES a permission — the
 * asymmetry with granting is deliberate.
 */
consentRouter.delete(
  '/:patientId/:purpose',
  requirePermission('patient.update'),
  validate(withdrawParamsSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) => {
    const clinicId = clinicOf(req);
    const { patientId, purpose } = req.params as unknown as z.infer<typeof withdrawParamsSchema>;

    const patient = await prisma.patient.findFirst({
      where: { id: patientId, clinicId },
      select: { id: true, phone: true }
    });
    if (!patient) throw new AppError('Patient not found', 404);

    const ok = await withdrawConsent({
      clinicId,
      patientId: patient.id,
      purpose,
      channel: 'staff',
      phone: patient.phone,
      evidence: `withdrawn by staff (${req.user?.email ?? 'unknown'})`
    });

    if (!ok) throw new AppError('Could not record the withdrawal. Please try again.', 500);

    res.json({ success: true, data: { patientId: patient.id, purpose, status: 'withdrawn' } });
  })
);

export default consentRouter;
