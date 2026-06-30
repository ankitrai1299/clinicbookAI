import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  createDraftHandler,
  getNoteHandler,
  listNotesHandler,
  reviewNoteHandler,
  transcribeHandler
} from './novascribe.controller.js';
import {
  createDraftSchema,
  listNotesQuerySchema,
  noteIdParamsSchema,
  reviewSchema,
  transcribeSchema
} from './novascribe.schemas.js';

const novascribeRouter = Router();

// Same clinic-admin auth as the rest of the dashboard API.
novascribeRouter.use(requireAuth);

novascribeRouter.get('/notes', validate(listNotesQuerySchema, 'query'), listNotesHandler);
novascribeRouter.post('/notes', validate(createDraftSchema), createDraftHandler);
novascribeRouter.get('/notes/:id', validate(noteIdParamsSchema, 'params'), getNoteHandler);
novascribeRouter.post(
  '/notes/:id/transcribe',
  validate(noteIdParamsSchema, 'params'),
  validate(transcribeSchema),
  transcribeHandler
);
novascribeRouter.patch(
  '/notes/:id',
  validate(noteIdParamsSchema, 'params'),
  validate(reviewSchema),
  reviewNoteHandler
);

export default novascribeRouter;
