import { Router } from 'express';

import { requirePermission } from '../authz/requirePermission.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  addDoctorLeaveHandler,
  createDoctorHandler,
  deleteDoctorHandler,
  deleteDoctorLeaveHandler,
  getDoctorAppointmentsHandler,
  getDoctorLeavesHandler,
  getDoctorScheduleHandler,
  getDoctorsHandler,
  setDoctorCredentialsHandler,
  setDoctorScheduleHandler,
  updateDoctorHandler,
} from './doctor.controller.js';
import {
  createDoctorSchema,
  createLeaveSchema,
  leaveIdParamsSchema,
  setDoctorCredentialsSchema,
  setScheduleSchema,
  updateDoctorSchema,
} from './doctor.schemas.js';

const doctorRouter = Router();

doctorRouter.use(requireAuth);

// Everyone who books needs to SEE doctors; only an owner may add, edit, remove
// or hand one an app login.
doctorRouter.get('/', requirePermission('doctor.read'), getDoctorsHandler);
doctorRouter.post('/', requirePermission('doctor.manage'), validate(createDoctorSchema), createDoctorHandler);
doctorRouter.patch('/:id', requirePermission('doctor.manage'), validate(updateDoctorSchema), updateDoctorHandler);
doctorRouter.delete('/:id', requirePermission('doctor.manage'), deleteDoctorHandler);

// Admin gives this doctor an app login (sets a password on their row).
doctorRouter.post(
  '/:id/credentials',
  requirePermission('doctor.manage'),
  validate(setDoctorCredentialsSchema),
  setDoctorCredentialsHandler
);

// Weekly schedule
doctorRouter.get('/:id/schedule', requirePermission('doctor.read'), getDoctorScheduleHandler);
doctorRouter.put('/:id/schedule', requirePermission('doctor.manage'), validate(setScheduleSchema), setDoctorScheduleHandler);

// Leaves
doctorRouter.get('/:id/leaves', requirePermission('doctor.read'), getDoctorLeavesHandler);
doctorRouter.post('/:id/leaves', requirePermission('doctor.manage'), validate(createLeaveSchema), addDoctorLeaveHandler);
doctorRouter.delete(
  '/:id/leaves/:leaveId',
  requirePermission('doctor.manage'),
  validate(leaveIdParamsSchema, 'params'),
  deleteDoctorLeaveHandler
);

// Appointments for a doctor
doctorRouter.get('/:id/appointments', requirePermission('appointment.read'), getDoctorAppointmentsHandler);

export default doctorRouter;
