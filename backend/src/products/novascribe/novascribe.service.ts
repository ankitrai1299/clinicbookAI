// NovaScribe service — consultation lifecycle. Thin orchestration over the
// pipeline (STT + AI), storage and job queue. All DB access is tenant-scoped.
//
// Lifecycle:
//   create draft (manual or via appointment.completed)        -> AWAITING_AUDIO
//   attach audio  -> save + enqueue STT/AI pipeline (async)    -> PROCESSING
//   pipeline done                                              -> DRAFTED (or FAILED)
//   paste transcript -> enqueue AI pipeline (async)            -> PROCESSING -> DRAFTED
//   doctor edits/approves                                      -> REVIEWED / FINALIZED
//
// AI output is ALWAYS a draft; only the doctor finalizes (immutable, emits
// consultation.finalized for downstream products like PatientLoop).

import { Prisma, ConsultationNoteStatus } from '@prisma/client';

import { isAiConfigured } from '../../core/ai/llm.js';
import { eventBus } from '../../core/events/index.js';
import { forClinic } from '../../config/tenantPrisma.js';
import { AppError } from '../../utils/AppError.js';
import { novascribeQueue } from './jobs/queue.js';
import { processAudioPipeline, runTranscriptPipeline } from './pipeline/pipeline.js';
import { getAudioStorage } from './storage/index.js';
import type { PrescriptionItem } from './novascribe.types.js';

export interface CreateDraftInput {
  clinicId: string;
  appointmentId?: string;
  patientId?: string;
  doctorId?: string;
  patientName?: string;
  doctorName?: string;
}

/**
 * Open a draft consultation note. Idempotent per appointment (a re-emitted
 * appointment.completed event never creates duplicates).
 */
export const createConsultationDraft = async (input: CreateDraftInput) => {
  const db = forClinic(input.clinicId);

  if (input.appointmentId) {
    const existing = await db.consultationNote.findFirst({
      where: { clinicId: input.clinicId, appointmentId: input.appointmentId }
    });
    if (existing) {
      return existing;
    }
  }

  return db.consultationNote.create({
    data: {
      clinicId: input.clinicId,
      appointmentId: input.appointmentId ?? null,
      patientId: input.patientId ?? null,
      doctorId: input.doctorId ?? null,
      patientName: input.patientName ?? null,
      doctorName: input.doctorName ?? null,
      status: ConsultationNoteStatus.AWAITING_AUDIO
    }
  });
};

export interface ListNotesOptions {
  status?: ConsultationNoteStatus;
  limit?: number;
}

export const listConsultationNotes = (clinicId: string, opts: ListNotesOptions = {}) =>
  forClinic(clinicId).consultationNote.findMany({
    where: { clinicId, ...(opts.status ? { status: opts.status } : {}) },
    orderBy: { createdAt: 'desc' },
    take: Math.min(opts.limit ?? 100, 200)
  });

export const getConsultationNote = async (clinicId: string, id: string) => {
  const note = await forClinic(clinicId).consultationNote.findFirst({ where: { id, clinicId } });
  if (!note) {
    throw new AppError('Consultation note not found', 404);
  }
  return note;
};

const assertEditable = (note: { status: ConsultationNoteStatus }) => {
  if (note.status === ConsultationNoteStatus.FINALIZED) {
    throw new AppError('This note is finalized and can no longer be changed', 409);
  }
};

const extFromMime = (mime?: string): string => {
  switch ((mime ?? '').toLowerCase()) {
    case 'audio/webm':
      return 'webm';
    case 'audio/mpeg':
    case 'audio/mp3':
      return 'mp3';
    case 'audio/wav':
    case 'audio/x-wav':
      return 'wav';
    case 'audio/m4a':
    case 'audio/mp4':
      return 'm4a';
    case 'audio/ogg':
      return 'ogg';
    default:
      return 'bin';
  }
};

/**
 * Save consultation audio and kick off the STT + AI pipeline asynchronously.
 * Returns the note in PROCESSING immediately; the client polls for DRAFTED.
 */
export const attachAudio = async (
  clinicId: string,
  id: string,
  audio: Buffer,
  mimeType?: string,
  languageHint?: string
) => {
  const db = forClinic(clinicId);
  const note = await db.consultationNote.findFirst({ where: { id, clinicId } });
  if (!note) {
    throw new AppError('Consultation note not found', 404);
  }
  assertEditable(note);
  if (!isAiConfigured()) {
    throw new AppError('AI is not configured. Add OPENAI_API_KEY to backend/.env', 503);
  }

  const key = `${clinicId}/${id}.${extFromMime(mimeType)}`;
  await getAudioStorage().save(key, audio, mimeType);

  const updated = await db.consultationNote.update({
    where: { id, clinicId },
    data: { audioPath: key, status: ConsultationNoteStatus.PROCESSING, errorMessage: null }
  });

  novascribeQueue.enqueue(`audio:${id}`, () =>
    processAudioPipeline(clinicId, id, key, languageHint)
  );

  return updated;
};

/**
 * Drive the AI pipeline from a pasted/typed transcript (bypasses STT). Async +
 * poll, same as audio.
 */
export const generateFromTranscript = async (clinicId: string, id: string, transcript: string) => {
  const db = forClinic(clinicId);
  const note = await db.consultationNote.findFirst({ where: { id, clinicId } });
  if (!note) {
    throw new AppError('Consultation note not found', 404);
  }
  assertEditable(note);
  if (!isAiConfigured()) {
    throw new AppError('AI is not configured. Add OPENAI_API_KEY to backend/.env', 503);
  }

  const updated = await db.consultationNote.update({
    where: { id, clinicId },
    data: { transcript, status: ConsultationNoteStatus.PROCESSING, errorMessage: null }
  });

  novascribeQueue.enqueue(`transcript:${id}`, async () => {
    try {
      await runTranscriptPipeline(clinicId, id, transcript);
    } catch (err) {
      await forClinic(clinicId).consultationNote.update({
        where: { id, clinicId },
        data: {
          status: ConsultationNoteStatus.FAILED,
          errorMessage: err instanceof Error ? err.message : String(err)
        }
      });
    }
  });

  return updated;
};

export interface ReviewInput {
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  prescription?: PrescriptionItem[];
  finalize?: boolean;
}

/**
 * Doctor reviews/edits the draft. finalize=true locks it (FINALIZED, immutable)
 * and emits consultation.finalized for downstream products.
 */
export const reviewConsultationNote = async (
  clinicId: string,
  id: string,
  edits: ReviewInput,
  reviewedBy: string
) => {
  const db = forClinic(clinicId);
  const note = await db.consultationNote.findFirst({ where: { id, clinicId } });
  if (!note) {
    throw new AppError('Consultation note not found', 404);
  }
  assertEditable(note);

  const finalize = edits.finalize === true;

  const data: Prisma.ConsultationNoteUpdateInput = {
    status: finalize ? ConsultationNoteStatus.FINALIZED : ConsultationNoteStatus.REVIEWED,
    reviewedBy,
    ...(finalize ? { reviewedAt: new Date() } : {})
  };
  if (edits.subjective !== undefined) data.subjective = edits.subjective;
  if (edits.objective !== undefined) data.objective = edits.objective;
  if (edits.assessment !== undefined) data.assessment = edits.assessment;
  if (edits.plan !== undefined) data.plan = edits.plan;
  if (edits.prescription !== undefined) {
    data.prescription = edits.prescription as unknown as Prisma.InputJsonValue;
  }

  const updated = await db.consultationNote.update({ where: { id, clinicId }, data });

  if (finalize) {
    eventBus.emit('consultation.finalized', {
      clinicId,
      consultationNoteId: updated.id,
      patientId: updated.patientId ?? undefined
    });
  }

  return updated;
};
