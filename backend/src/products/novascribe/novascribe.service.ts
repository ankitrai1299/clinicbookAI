// NovaScribe — the doctor's AI scribe.
//
// Flow:
//   1. ClinicBook completes an appointment → `appointment.completed` event →
//      we open a draft note (status AWAITING_AUDIO).  [see novascribe.subscriptions]
//   2. The consultation transcript arrives (typed/pasted now; STT later) →
//      generateFromTranscript() asks the LLM for a SOAP note + prescription draft
//      → status DRAFTED.
//   3. The doctor reviews/edits and approves → reviewConsultationNote(finalize)
//      → status FINALIZED (locked) and we emit `consultation.finalized`.
//
// Everything is tenant-scoped via forClinic(clinicId). The AI output is always a
// DRAFT for a licensed doctor to review — never auto-finalised.

import { Prisma, ConsultationNoteStatus } from '@prisma/client';

import { complete, isAiConfigured } from '../../core/ai/llm.js';
import { eventBus } from '../../core/events/index.js';
import { forClinic } from '../../config/tenantPrisma.js';
import { AppError } from '../../utils/AppError.js';

export interface PrescriptionItem {
  drug: string;
  dose: string;
  frequency: string;
  duration: string;
  notes: string;
}

interface SoapDraft {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  prescription: PrescriptionItem[];
}

export interface CreateDraftInput {
  clinicId: string;
  appointmentId?: string;
  patientId?: string;
  doctorId?: string;
  patientName?: string;
  doctorName?: string;
}

/**
 * Open a draft consultation note. Idempotent per appointment: if a note already
 * exists for the appointmentId, the existing one is returned (so a re-emitted
 * `appointment.completed` event never creates duplicates).
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

const SOAP_SYSTEM = [
  'You are a clinical documentation assistant helping a licensed doctor.',
  'From a doctor–patient consultation transcript, produce a structured SOAP note',
  'and a prescription draft.',
  'Return STRICT JSON with exactly this shape:',
  '{',
  '  "subjective": string,   // patient-reported history, symptoms, concerns',
  '  "objective": string,    // exam findings, vitals, measurable observations',
  '  "assessment": string,   // diagnosis / clinical impression',
  '  "plan": string,         // treatment plan, investigations, follow-up',
  '  "prescription": [ { "drug": string, "dose": string, "frequency": string, "duration": string, "notes": string } ]',
  '}',
  'Rules: use an empty string or empty array when information is not present.',
  'Do NOT invent clinical facts, diagnoses, or drugs that are not supported by the transcript.',
  'This output is a DRAFT that the doctor will review, edit and approve before use.'
].join('\n');

const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

const normalisePrescription = (v: unknown): PrescriptionItem[] => {
  if (!Array.isArray(v)) {
    return [];
  }
  return v
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      drug: asString(item.drug),
      dose: asString(item.dose),
      frequency: asString(item.frequency),
      duration: asString(item.duration),
      notes: asString(item.notes)
    }))
    .filter((item) => item.drug.length > 0);
};

/** Ask the LLM to draft a SOAP note + prescription from a transcript. */
const draftSoapNote = async (transcript: string): Promise<SoapDraft> => {
  const raw = await complete({
    system: SOAP_SYSTEM,
    user: `Consultation transcript:\n${transcript}`,
    json: true,
    temperature: 0.2
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new AppError('AI returned a malformed draft. Please try again.', 502);
  }

  return {
    subjective: asString(parsed.subjective),
    objective: asString(parsed.objective),
    assessment: asString(parsed.assessment),
    plan: asString(parsed.plan),
    prescription: normalisePrescription(parsed.prescription)
  };
};

/**
 * Generate (or regenerate) the SOAP + prescription draft for a note from a
 * transcript. Moves the note to DRAFTED. A FINALIZED note is locked.
 */
export const generateFromTranscript = async (clinicId: string, id: string, transcript: string) => {
  const db = forClinic(clinicId);

  const note = await db.consultationNote.findFirst({ where: { id, clinicId } });
  if (!note) {
    throw new AppError('Consultation note not found', 404);
  }
  if (note.status === ConsultationNoteStatus.FINALIZED) {
    throw new AppError('This note is finalized and can no longer be regenerated', 409);
  }
  if (!isAiConfigured()) {
    throw new AppError('AI is not configured. Add OPENAI_API_KEY to backend/.env', 503);
  }

  const draft = await draftSoapNote(transcript);

  return db.consultationNote.update({
    where: { id },
    data: {
      transcript,
      subjective: draft.subjective,
      objective: draft.objective,
      assessment: draft.assessment,
      plan: draft.plan,
      prescription: draft.prescription as unknown as Prisma.InputJsonValue,
      status: ConsultationNoteStatus.DRAFTED
    }
  });
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
 * Doctor reviews/edits the draft. With finalize=true the note is locked
 * (FINALIZED) and `consultation.finalized` is emitted for downstream products
 * (e.g. PatientLoop medicine reminders).
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
  if (note.status === ConsultationNoteStatus.FINALIZED) {
    throw new AppError('This note is already finalized', 409);
  }

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

  const updated = await db.consultationNote.update({ where: { id }, data });

  if (finalize) {
    eventBus.emit('consultation.finalized', {
      clinicId,
      consultationNoteId: updated.id,
      patientId: updated.patientId ?? undefined
    });
  }

  return updated;
};
