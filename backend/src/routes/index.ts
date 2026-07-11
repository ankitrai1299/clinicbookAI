import { Router } from 'express';

import aiRouter from '../core/ai/ai.routes.js';
import analyticsRouter from '../core/analytics/analytics.routes.js';
import apiKeyRouter from '../core/apikeys/apiKey.routes.js';
import appointmentRouter from '../products/clinicbook/appointments/appointment.routes.js';
import authRouter from '../core/auth/auth.routes.js';
import billingRouter from '../core/billing/billing.routes.js';
import clinicRouter from '../core/clinics/clinic.routes.js';
import doctorRouter from '../core/doctors/doctor.routes.js';
import notificationRouter from '../core/notifications/notification.routes.js';
import patientRouter from '../core/patients/patient.routes.js';
import publicPatientRouter from '../core/patients/public.routes.js';
import publicApiV1Router from '../core/publicapi/v1.routes.js';
import { mediscribeRouter } from '../products/mediscribe/router.js';
import waitlistRouter from '../products/clinicbook/waitlist/waitlist.routes.js';
import whatsappRouter from '../core/whatsapp/whatsapp.routes.js';
import { requireAuth } from '../middleware/auth.js';
import patient360Router from './patient360.routes.js';
import healthRouter from './health.routes.js';

const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use('/api/auth', authRouter);
apiRouter.use('/api/ai', aiRouter);
apiRouter.use('/api/billing', billingRouter);
apiRouter.use('/api/clinics', clinicRouter);
apiRouter.use('/api/doctors', doctorRouter);
apiRouter.use('/api/notifications', notificationRouter);
apiRouter.use('/api/patients', patientRouter);
apiRouter.use('/api/public', publicPatientRouter);
// Partner-facing PUBLIC API, authenticated by an ApiKey (not a JWT). Versioned.
apiRouter.use('/api/v1', publicApiV1Router);
// Managing those keys, by contrast, is a dashboard (JWT) action — never key-authed.
apiRouter.use('/api/api-keys', apiKeyRouter);
apiRouter.use('/api/appointments', appointmentRouter);
apiRouter.use('/api/waitlist', waitlistRouter);
// MediScribe (the new AI scribe) — ClinicBook requireAuth first so the bridge has
// req.user; then the ported router scopes everything to that clinic.
apiRouter.use('/api/mediscribe', requireAuth, mediscribeRouter);
apiRouter.use('/api/whatsapp', whatsappRouter);
apiRouter.use('/api/analytics', analyticsRouter);
// Patient 360 — one patient id/code → their complete cross-product record.
apiRouter.use('/api/patient-record', patient360Router);

export default apiRouter;