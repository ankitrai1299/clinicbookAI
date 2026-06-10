import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  createDoctorHandler,
  deleteDoctorHandler,
  getDoctorsHandler,
  updateDoctorHandler,
} from './doctor.controller.js';
import { createDoctorSchema, updateDoctorSchema } from './doctor.schemas.js';

const doctorRouter = Router();

doctorRouter.use(requireAuth);
doctorRouter.get('/', getDoctorsHandler);
doctorRouter.post('/', validate(createDoctorSchema), createDoctorHandler);
doctorRouter.patch('/:id', validate(updateDoctorSchema), updateDoctorHandler);
doctorRouter.delete('/:id', deleteDoctorHandler);

export default doctorRouter;
