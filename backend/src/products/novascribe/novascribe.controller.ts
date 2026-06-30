import { Request, Response } from 'express';

import { AppError } from '../../utils/AppError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  attachAudio,
  createConsultationDraft,
  generateFromTranscript,
  getConsultationNote,
  listConsultationNotes,
  reviewConsultationNote
} from './novascribe.service.js';
import {
  CreateDraftInputBody,
  ListNotesQuery,
  NoteIdParams,
  ReviewInputBody,
  TranscribeInput
} from './novascribe.schemas.js';

const getClinicId = (req: Request): string => {
  const clinicId = req.user?.clinicId;
  if (!clinicId) {
    throw new AppError('Authentication required', 401);
  }
  return clinicId;
};

const getUserId = (req: Request): string => {
  const userId = req.user?.userId;
  if (!userId) {
    throw new AppError('Authentication required', 401);
  }
  return userId;
};

export const listNotesHandler = asyncHandler(async (req: Request, res: Response) => {
  const clinicId = getClinicId(req);
  const { status } = req.query as ListNotesQuery;
  const notes = await listConsultationNotes(clinicId, { status });

  res.status(200).json({ success: true, data: notes });
});

export const getNoteHandler = asyncHandler(async (req: Request, res: Response) => {
  const clinicId = getClinicId(req);
  const { id } = req.params as NoteIdParams;
  const note = await getConsultationNote(clinicId, id);

  res.status(200).json({ success: true, data: note });
});

export const createDraftHandler = asyncHandler(async (req: Request, res: Response) => {
  const clinicId = getClinicId(req);
  const body = req.body as CreateDraftInputBody;
  const note = await createConsultationDraft({ clinicId, ...body });

  res.status(201).json({
    success: true,
    message: 'Consultation note created',
    data: note
  });
});

export const attachAudioHandler = asyncHandler(async (req: Request, res: Response) => {
  const clinicId = getClinicId(req);
  const { id } = req.params as NoteIdParams;
  const file = (req as Request & { file?: { buffer: Buffer; mimetype: string } }).file;
  if (!file) {
    throw new AppError('Audio file is required (field name: "audio")', 400);
  }
  const languageHint = typeof req.body?.language === 'string' ? req.body.language : undefined;
  const note = await attachAudio(clinicId, id, file.buffer, file.mimetype, languageHint);

  res.status(202).json({
    success: true,
    message: 'Audio received — transcription & AI draft in progress',
    data: note
  });
});

export const transcribeHandler = asyncHandler(async (req: Request, res: Response) => {
  const clinicId = getClinicId(req);
  const { id } = req.params as NoteIdParams;
  const { transcript } = req.body as TranscribeInput;
  const note = await generateFromTranscript(clinicId, id, transcript);

  res.status(200).json({
    success: true,
    message: 'SOAP note + prescription drafted',
    data: note
  });
});

export const reviewNoteHandler = asyncHandler(async (req: Request, res: Response) => {
  const clinicId = getClinicId(req);
  const userId = getUserId(req);
  const { id } = req.params as NoteIdParams;
  const note = await reviewConsultationNote(clinicId, id, req.body as ReviewInputBody, userId);

  res.status(200).json({
    success: true,
    message: (req.body as ReviewInputBody).finalize ? 'Consultation note finalized' : 'Consultation note updated',
    data: note
  });
});
