import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  completeAppointmentHandler,
  createAppointmentHandler,
  deleteAppointmentHandler,
  getAppointmentsHandler,
  getSingleAppointmentHandler,
  patchAppointmentHandler
} from './appointment.controller.js';
import {
  appointmentIdParamsSchema,
  createAppointmentSchema,
  updateAppointmentSchema
} from './appointment.schemas.js';

const appointmentRouter = Router();

appointmentRouter.use(requireAuth);

appointmentRouter.post('/', validate(createAppointmentSchema), createAppointmentHandler);
appointmentRouter.get('/', getAppointmentsHandler);
appointmentRouter.get('/:id', validate(appointmentIdParamsSchema, 'params'), getSingleAppointmentHandler);
appointmentRouter.patch('/:id/complete', validate(appointmentIdParamsSchema, 'params'), completeAppointmentHandler);
appointmentRouter.patch('/:id', validate(appointmentIdParamsSchema, 'params'), validate(updateAppointmentSchema), patchAppointmentHandler);
appointmentRouter.delete('/:id', validate(appointmentIdParamsSchema, 'params'), deleteAppointmentHandler);

export default appointmentRouter;