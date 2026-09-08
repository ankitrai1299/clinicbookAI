import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { validate } from '../../middleware/validate.js';
import {
  bookPublicAppointmentHandler,
  getPublicAvailabilityHandler,
  getPublicClinicHandler,
  getPublicDoctorsHandler,
  publicAbhaOtpHandler,
  publicAbhaVerifyHandler,
  registerPublicPatientHandler
} from './public.controller.js';
import {
  clinicIdParamsSchema,
  publicAbhaOtpSchema,
  publicAbhaVerifySchema,
  publicAvailabilityQuerySchema,
  publicBookingSchema,
  publicRegisterPatientSchema
} from './patient.schemas.js';

// Public, unauthenticated routes backing the shareable /register page and the
// landing-page booking funnel. Clinic context comes from the URL param, never auth.
const publicPatientRouter = Router();

// Tighter throttle on the write endpoints (create patient / book appointment),
// which persist records and trigger real WhatsApp messages — abuse guard.
const publicWriteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 10, // per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' }
});

// ── ABHA, on a page with no login ──────────────────────────────────────────
//
// Far tighter than the write limiter below, and for a different reason. These
// two do not merely create a row: the first asks UIDAI about an Aadhaar number
// and sends a real person a text message. Unthrottled, a public link becomes a
// way to test Aadhaar numbers against the government, and to text strangers.
//
// Five an hour is generous for a waiting room — a patient needs one, and a
// mistyped number needs a second — and useless to anyone working through a list.
const publicAbhaLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many Aadhaar attempts from this device. Please try again later.'
  }
});

publicPatientRouter.post(
  '/clinic/:clinicId/abha/otp',
  publicAbhaLimiter,
  validate(clinicIdParamsSchema, 'params'),
  validate(publicAbhaOtpSchema),
  publicAbhaOtpHandler
);

publicPatientRouter.post(
  '/clinic/:clinicId/abha/verify',
  publicAbhaLimiter,
  validate(clinicIdParamsSchema, 'params'),
  validate(publicAbhaVerifySchema),
  publicAbhaVerifyHandler
);

publicPatientRouter.get(
  '/clinic/:clinicId',
  validate(clinicIdParamsSchema, 'params'),
  getPublicClinicHandler
);

publicPatientRouter.get(
  '/clinic/:clinicId/doctors',
  validate(clinicIdParamsSchema, 'params'),
  getPublicDoctorsHandler
);

publicPatientRouter.get(
  '/clinic/:clinicId/availability',
  validate(clinicIdParamsSchema, 'params'),
  validate(publicAvailabilityQuerySchema, 'query'),
  getPublicAvailabilityHandler
);

publicPatientRouter.post(
  '/clinic/:clinicId/register',
  publicWriteLimiter,
  validate(clinicIdParamsSchema, 'params'),
  validate(publicRegisterPatientSchema),
  registerPublicPatientHandler
);

publicPatientRouter.post(
  '/clinic/:clinicId/book',
  publicWriteLimiter,
  validate(clinicIdParamsSchema, 'params'),
  validate(publicBookingSchema),
  bookPublicAppointmentHandler
);

export default publicPatientRouter;
