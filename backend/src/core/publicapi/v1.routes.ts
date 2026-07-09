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
import type { TenantClient } from '../../config/tenantPrisma.js';
import { requireApiKey, requireScope } from '../../middleware/apiKeyAuth.js';
import { apiKeyLimiter } from '../../middleware/rateLimiters.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError } from '../../utils/AppError.js';
import { dataSourceFor } from '../datasource/index.js';
import { ensurePatient } from '../patients/patient.service.js';
import { getAvailableSlots, isSlotAvailable } from '../../services/scheduling.service.js';
import {
  cancelAppointment,
  createAppointment,
  getSingleAppointment,
  updateAppointment
} from '../../products/clinicbook/appointments/appointment.service.js';
import { claim, complete, release } from './idempotency.js';
import {
  appointmentIdParamsSchema,
  bookAppointmentSchema,
  toPublicAppointment,
  updateAppointmentSchema,
  type BookAppointmentInput,
  type UpdateAppointmentInput
} from './v1.schemas.js';

const router = Router();

// Every /api/v1 route is key-authenticated and tenant-bound, then rate-limited
// PER KEY (not per IP — see rateLimiters.ts). Order matters: the limiter needs
// req.apiKey.id, which requireApiKey sets.
router.use(requireApiKey);
router.use(apiKeyLimiter);

const clinicId = (req: { clinic?: { id: string } }): string => req.clinic!.id;
const tenantDb = (req: { db?: TenantClient }): TenantClient => req.db!;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/v1/me
 * Who am I? Lets an integrator verify their key works before wiring anything.
 */
router.get(
  '/me',
  requireScope('read'),
  asyncHandler(async (req, res) => {
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId(req) },
      select: { id: true, name: true, isSandbox: true }
    });
    if (!clinic) throw new AppError('Clinic not found', 404);
    // Echo mode + scopes: the single most common integration bug is "I'm hitting
    // prod with my test key" (or the reverse), and this is where they'd find out.
    res.status(200).json({
      success: true,
      data: {
        clinicId: clinic.id,
        clinicName: clinic.name,
        mode: req.apiKey!.mode,
        scopes: req.apiKey!.scopes,
        sandbox: clinic.isSandbox
      }
    });
  })
);

/**
 * GET /api/v1/doctors
 * The clinic's bookable doctors. Native clinics: from our DB. EMR clinics:
 * live from their EMR (shadow-mirrored), returned with the same local ids.
 */
router.get(
  '/doctors',
  requireScope('read'),
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
  requireScope('read'),
  asyncHandler(async (req, res) => {
    const date = String(req.query.date ?? '');
    if (!DATE_RE.test(date)) {
      throw new AppError('Query param `date` is required as YYYY-MM-DD.', 400);
    }
    const slots = await getAvailableSlots(clinicId(req), req.params.id, date);
    res.status(200).json({ success: true, data: { doctorId: req.params.id, date, slots } });
  })
);

/**
 * POST /api/v1/appointments
 * Book. The patient is identified by phone and found-or-created, so a partner
 * never holds our patient ids. Send an `Idempotency-Key` header and a retry after
 * a timeout replays the original booking instead of creating a second one.
 *
 * 201 booked · 404 unknown doctor · 409 slot not bookable / retry in progress
 */
router.post(
  '/appointments',
  requireScope('write'),
  validate(bookAppointmentSchema),
  asyncHandler(async (req, res) => {
    const cid = clinicId(req);
    const db = tenantDb(req);
    const body = req.body as BookAppointmentInput;
    const idemKey = req.get('idempotency-key')?.trim() || undefined;

    if (idemKey) {
      const claimed = await claim(db, cid, idemKey, 'POST /v1/appointments');
      if (claimed.status === 'replay') {
        const existing = await getSingleAppointment(cid, claimed.appointmentId);
        res.status(200).json({ success: true, data: toPublicAppointment(existing), replayed: true });
        return;
      }
      if (claimed.status === 'in-progress') {
        throw new AppError('A request with this Idempotency-Key is already in progress.', 409);
      }
    }

    try {
      // Validate the doctor BEFORE creating a patient, so a bad doctorId never
      // leaves an orphan patient behind. (createAppointment re-asserts anyway.)
      const doctor = await dataSourceFor(cid).doctors.findRefById(body.doctorId);
      if (!doctor) throw new AppError('Doctor not found at this clinic', 404);

      // Reject anything that isn't a real, currently-open slot. The atomic
      // slot-lock inside createAppointment is still the final arbiter.
      if (!(await isSlotAvailable(cid, doctor.id, body.date, body.time))) {
        throw new AppError('That time slot is not available. Fetch /doctors/:id/slots for open times.', 409);
      }

      const patient = await ensurePatient(cid, {
        name: body.patientName,
        phone: body.patientPhone,
        language: body.patientLanguage
      });

      const appointment = await createAppointment(
        cid,
        {
          doctorId: doctor.id,
          patientId: patient.id,
          appointmentDate: body.date,
          appointmentTime: body.time
        },
        body.notify !== undefined ? { notify: body.notify } : {}
      );

      if (idemKey) await complete(db, cid, idemKey, appointment.id);
      res.status(201).json({ success: true, data: toPublicAppointment(appointment) });
    } catch (err) {
      // Drop the claim so the partner can legitimately retry this booking.
      if (idemKey) release(db, cid, idemKey);
      throw err;
    }
  })
);

/** GET /api/v1/appointments/:id — read one booking. */
router.get(
  '/appointments/:id',
  requireScope('read'),
  validate(appointmentIdParamsSchema, 'params'),
  asyncHandler(async (req, res) => {
    const appointment = await getSingleAppointment(clinicId(req), req.params.id);
    res.status(200).json({ success: true, data: toPublicAppointment(appointment) });
  })
);

/**
 * PATCH /api/v1/appointments/:id
 * `{ "status": "CANCELLED" }` to cancel, or `{ "date", "time" }` to reschedule.
 * Cancelling frees the slot for the waitlist and messages the patient exactly once.
 */
router.patch(
  '/appointments/:id',
  requireScope('write'),
  validate(appointmentIdParamsSchema, 'params'),
  validate(updateAppointmentSchema),
  asyncHandler(async (req, res) => {
    const cid = clinicId(req);
    const body = req.body as UpdateAppointmentInput;

    const appointment =
      body.status === 'CANCELLED'
        ? await cancelAppointment(cid, req.params.id)
        : await updateAppointment(cid, req.params.id, {
            ...(body.date !== undefined ? { appointmentDate: body.date } : {}),
            ...(body.time !== undefined ? { appointmentTime: body.time } : {})
          });

    res.status(200).json({ success: true, data: toPublicAppointment(appointment) });
  })
);

export default router;
