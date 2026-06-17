import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { validate } from '../../middleware/validate.js';
import {
  bookPublicAppointmentHandler,
  getPublicAvailabilityHandler,
  getPublicClinicHandler,
  getPublicDoctorsHandler,
  registerPublicPatientHandler
} from './public.controller.js';
import {
  clinicIdParamsSchema,
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
