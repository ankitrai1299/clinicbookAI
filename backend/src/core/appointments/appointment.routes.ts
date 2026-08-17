import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { requirePermission } from '../authz/requirePermission.js';
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

// Booking is front-desk work, so a receptionist holds all four appointment
// permissions — this router's authorization is unchanged in practice for every
// role that exists today, and only refuses a role that has none of them.
appointmentRouter.post(
  '/',
  requirePermission('appointment.create'),
  validate(createAppointmentSchema),
  createAppointmentHandler
);
appointmentRouter.get('/', requirePermission('appointment.read'), getAppointmentsHandler);
appointmentRouter.get(
  '/:id',
  requirePermission('appointment.read'),
  validate(appointmentIdParamsSchema, 'params'),
  getSingleAppointmentHandler
);
appointmentRouter.patch(
  '/:id/complete',
  requirePermission('appointment.update'),
  validate(appointmentIdParamsSchema, 'params'),
  completeAppointmentHandler
);
appointmentRouter.patch(
  '/:id',
  requirePermission('appointment.update'),
  validate(appointmentIdParamsSchema, 'params'),
  validate(updateAppointmentSchema),
  patchAppointmentHandler
);
// DELETE on this route cancels the booking (it is not a hard delete) — hence
// appointment.cancel rather than a delete permission.
appointmentRouter.delete(
  '/:id',
  requirePermission('appointment.cancel'),
  validate(appointmentIdParamsSchema, 'params'),
  deleteAppointmentHandler
);

export default appointmentRouter;