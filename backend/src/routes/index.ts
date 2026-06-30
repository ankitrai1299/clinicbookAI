import { Router } from 'express';

import aiRouter from '../core/ai/ai.routes.js';
import analyticsRouter from '../core/analytics/analytics.routes.js';
import appointmentRouter from '../products/clinicbook/appointments/appointment.routes.js';
import authRouter from '../core/auth/auth.routes.js';
import billingRouter from '../core/billing/billing.routes.js';
import clinicRouter from '../core/clinics/clinic.routes.js';
import doctorRouter from '../core/doctors/doctor.routes.js';
import notificationRouter from '../core/notifications/notification.routes.js';
import patientRouter from '../core/patients/patient.routes.js';
import publicPatientRouter from '../core/patients/public.routes.js';
import novascribeRouter from '../products/novascribe/novascribe.routes.js';
import waitlistRouter from '../products/clinicbook/waitlist/waitlist.routes.js';
import whatsappRouter from '../core/whatsapp/whatsapp.routes.js';
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
apiRouter.use('/api/appointments', appointmentRouter);
apiRouter.use('/api/waitlist', waitlistRouter);
apiRouter.use('/api/novascribe', novascribeRouter);
apiRouter.use('/api/whatsapp', whatsappRouter);
apiRouter.use('/api/analytics', analyticsRouter);

export default apiRouter;