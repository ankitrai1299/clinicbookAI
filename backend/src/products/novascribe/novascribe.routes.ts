import { Router } from 'express';
import multer from 'multer';

import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  attachAudioHandler,
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

// Audio is buffered in memory then handed to the storage backend. 30 MB cap —
// enough for a long OPD consultation in a compressed format (webm/opus, m4a).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }
});

const novascribeRouter = Router();

// Same clinic-admin auth as the rest of the dashboard API.
novascribeRouter.use(requireAuth);

novascribeRouter.get('/notes', validate(listNotesQuerySchema, 'query'), listNotesHandler);
novascribeRouter.post('/notes', validate(createDraftSchema), createDraftHandler);
novascribeRouter.get('/notes/:id', validate(noteIdParamsSchema, 'params'), getNoteHandler);

// Upload consultation audio → async STT + AI pipeline (poll the note for status).
novascribeRouter.post(
  '/notes/:id/audio',
  validate(noteIdParamsSchema, 'params'),
  upload.single('audio'),
  attachAudioHandler
);

// Drive the AI pipeline from a pasted/typed transcript (no audio).
novascribeRouter.post(
  '/notes/:id/transcribe',
  validate(noteIdParamsSchema, 'params'),
  validate(transcribeSchema),
  transcribeHandler
);

// Doctor edits / finalizes.
novascribeRouter.patch(
  '/notes/:id',
  validate(noteIdParamsSchema, 'params'),
  validate(reviewSchema),
  reviewNoteHandler
);

export default novascribeRouter;
