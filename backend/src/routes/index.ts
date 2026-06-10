import { Router } from 'express';

import analyticsRouter from '../modules/analytics/analytics.routes.js';
import appointmentRouter from '../modules/appointments/appointment.routes.js';
import authRouter from '../modules/auth/auth.routes.js';
import clinicRouter from '../modules/clinics/clinic.routes.js';
import doctorRouter from '../modules/doctors/doctor.routes.js';
import patientRouter from '../modules/patients/patient.routes.js';
import waitlistRouter from '../modules/waitlist/waitlist.routes.js';
import whatsappRouter from '../modules/whatsapp/whatsapp.routes.js';
import healthRouter from './health.routes.js';

const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use('/api/auth', authRouter);
apiRouter.use('/api/clinics', clinicRouter);
apiRouter.use('/api/doctors', doctorRouter);
apiRouter.use('/api/patients', patientRouter);
apiRouter.use('/api/appointments', appointmentRouter);
apiRouter.use('/api/waitlist', waitlistRouter);
apiRouter.use('/api/whatsapp', whatsappRouter);
apiRouter.use('/api/analytics', analyticsRouter);

export default apiRouter;