import { Router } from 'express';

import aiRouter from '../core/ai/ai.routes.js';
import analyticsRouter from '../core/analytics/analytics.routes.js';
import auditRouter from '../core/audit/audit.routes.js';
import consentRouter from '../core/consent/consent.routes.js';
import securityRouter from '../core/security/security.routes.js';
import rightsRouter from '../core/rights/rights.routes.js';
import apiKeyRouter from '../core/apikeys/apiKey.routes.js';
import appointmentRouter from '../core/appointments/appointment.routes.js';
import authRouter from '../core/auth/auth.routes.js';
import billingRouter from '../core/billing/billing.routes.js';
import clinicRouter from '../core/clinics/clinic.routes.js';
import doctorRouter from '../core/doctors/doctor.routes.js';
// Unmounted below — kept so restoring the portal is a one-line change.
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
// There was a second, separate doctor login here — its own password field, its
// own middleware, its own screens — unmounted but still in the tree. It is now
// DELETED. A doctor signs in through the one shared login and reaches their work
// in MediScribe; ClinicBook is for admins and the front desk (see
// core/authz/surfaces.ts). A disabled login sitting next to a live one is how
// the wrong one gets switched back on.
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

// The SAME router, also under /api/doctor.
//
// The native MediScribe app calls /api/doctor/* — it was built against an
// earlier backend that used that prefix. Rather than edit the app (it is
// reproduced from its reference verbatim, and any edit would be lost the next
// time it is copied), the routes answer on both paths. One handler, one set of
// permissions, two spellings.
apiRouter.use('/api/doctor', requireAuth, mediscribeRouter);
apiRouter.use('/api/whatsapp', whatsappRouter);
apiRouter.use('/api/analytics', analyticsRouter);
// The compliance audit trail. READ-ONLY by construction — the router defines no
// write verb, and the only writer is core/audit/audit.service.ts.
apiRouter.use('/api/audit', auditRouter);
// Consent: what a patient agreed to, and what they withdrew.
apiRouter.use('/api/consent', consentRouter);
// Detected security patterns. Alerts can be closed with a reason, never deleted.
apiRouter.use('/api/security', securityRouter);
// Patient rights: the queue of what has been asked, and the per-patient export.
apiRouter.use('/api/rights', rightsRouter);
// Patient 360 — one patient id/code → their complete cross-product record.
apiRouter.use('/api/patient-record', patient360Router);

export default apiRouter;