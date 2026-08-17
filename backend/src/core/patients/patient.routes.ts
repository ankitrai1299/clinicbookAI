import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { requirePermission } from '../authz/requirePermission.js';
import {
  createPatientHandler,
  deletePatientHandler,
  getPatientsHandler,
  getSinglePatientHandler,
  updatePatientHandler
} from './patient.controller.js';
import { createPatientSchema, patientIdParamsSchema, updatePatientSchema } from './patient.schemas.js';

const patientRouter = Router();

patientRouter.use(requireAuth);

// Authorization, per verb. Before this, every authenticated user of a clinic
// could delete every patient in it — requireAuth was the whole model. Reading
// and creating stay open to the front desk; DELETING a patient record does not.
patientRouter.post('/', requirePermission('patient.create'), validate(createPatientSchema), createPatientHandler);
patientRouter.get('/', requirePermission('patient.read'), getPatientsHandler);
patientRouter.get(
  '/:id',
  requirePermission('patient.read'),
  validate(patientIdParamsSchema, 'params'),
  getSinglePatientHandler
);
patientRouter.put(
  '/:id',
  requirePermission('patient.update'),
  validate(patientIdParamsSchema, 'params'),
  validate(updatePatientSchema),
  updatePatientHandler
);
patientRouter.delete(
  '/:id',
  requirePermission('patient.delete'),
  validate(patientIdParamsSchema, 'params'),
  deletePatientHandler
);

export default patientRouter;
