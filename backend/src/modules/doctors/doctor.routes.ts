import { Router } from 'express';

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
  setDoctorScheduleHandler,
  updateDoctorHandler,
} from './doctor.controller.js';
import {
  createDoctorSchema,
  createLeaveSchema,
  leaveIdParamsSchema,
  setScheduleSchema,
  updateDoctorSchema,
} from './doctor.schemas.js';

const doctorRouter = Router();

doctorRouter.use(requireAuth);

doctorRouter.get('/', getDoctorsHandler);
doctorRouter.post('/', validate(createDoctorSchema), createDoctorHandler);
doctorRouter.patch('/:id', validate(updateDoctorSchema), updateDoctorHandler);
doctorRouter.delete('/:id', deleteDoctorHandler);

// Weekly schedule
doctorRouter.get('/:id/schedule', getDoctorScheduleHandler);
doctorRouter.put('/:id/schedule', validate(setScheduleSchema), setDoctorScheduleHandler);

// Leaves
doctorRouter.get('/:id/leaves', getDoctorLeavesHandler);
doctorRouter.post('/:id/leaves', validate(createLeaveSchema), addDoctorLeaveHandler);
doctorRouter.delete('/:id/leaves/:leaveId', validate(leaveIdParamsSchema, 'params'), deleteDoctorLeaveHandler);

// Appointments for a doctor
doctorRouter.get('/:id/appointments', getDoctorAppointmentsHandler);

export default doctorRouter;
