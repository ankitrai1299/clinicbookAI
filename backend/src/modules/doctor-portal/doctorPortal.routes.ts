import { Router } from 'express';

import { requireDoctorAuth } from '../../middleware/doctorAuth.js';
import { validate } from '../../middleware/validate.js';
import { createLeaveSchema, setScheduleSchema } from '../../core/doctors/doctor.schemas.js';
import {
  addMyLeaveHandler,
  decideMyAppointmentHandler,
  deleteMyLeaveHandler,
  getDoctorMeHandler,
  getMyAppointmentsHandler,
  getMyLeavesHandler,
  getMyPatientsHandler,
  getMyScheduleHandler,
  loginDoctorHandler,
  registerDoctorHandler,
  setMyScheduleHandler
} from './doctorPortal.controller.js';
import {
  appointmentDecisionSchema,
  appointmentIdParamsSchema,
  doctorLoginSchema,
  doctorRegisterSchema,
  leaveParamsSchema
} from './doctorPortal.schemas.js';

const doctorPortalRouter = Router();

// --- Public auth endpoints ---
doctorPortalRouter.post('/auth/register', validate(doctorRegisterSchema), registerDoctorHandler);
doctorPortalRouter.post('/auth/login', validate(doctorLoginSchema), loginDoctorHandler);

// --- Everything below requires a doctor token ---
doctorPortalRouter.use(requireDoctorAuth);

doctorPortalRouter.get('/me', getDoctorMeHandler);

doctorPortalRouter.get('/schedule', getMyScheduleHandler);
doctorPortalRouter.put('/schedule', validate(setScheduleSchema), setMyScheduleHandler);

doctorPortalRouter.get('/leaves', getMyLeavesHandler);
doctorPortalRouter.post('/leaves', validate(createLeaveSchema), addMyLeaveHandler);
doctorPortalRouter.delete('/leaves/:leaveId', validate(leaveParamsSchema, 'params'), deleteMyLeaveHandler);

doctorPortalRouter.get('/appointments', getMyAppointmentsHandler);
doctorPortalRouter.patch(
  '/appointments/:id',
  validate(appointmentIdParamsSchema, 'params'),
  validate(appointmentDecisionSchema),
  decideMyAppointmentHandler
);

doctorPortalRouter.get('/patients', getMyPatientsHandler);

export default doctorPortalRouter;
