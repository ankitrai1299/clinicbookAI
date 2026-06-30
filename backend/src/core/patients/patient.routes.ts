import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
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

patientRouter.post('/', validate(createPatientSchema), createPatientHandler);
patientRouter.get('/', getPatientsHandler);
patientRouter.get('/:id', validate(patientIdParamsSchema, 'params'), getSinglePatientHandler);
patientRouter.put('/:id', validate(patientIdParamsSchema, 'params'), validate(updatePatientSchema), updatePatientHandler);
patientRouter.delete('/:id', validate(patientIdParamsSchema, 'params'), deletePatientHandler);

export default patientRouter;