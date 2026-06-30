// The NovaScribe AI pipeline orchestrator. Two entry points, one shared spine:
//
//   audio  ──▶ STT ──▶ transcript ─┐
//                                   ├─▶ understanding ─▶ drug-validate ─▶ verify ─▶ DRAFTED
//   transcript (typed/pasted) ──────┘
//
// Each stage is isolated; on any failure the note is marked FAILED with an
// errorMessage (the doctor can retry). Runs OFF the request cycle via the job
// queue (see novascribe.service.attachAudio).

import { Prisma, ConsultationNoteStatus } from '@prisma/client';

import { forClinic } from '../../../config/tenantPrisma.js';
import { validateDrug } from '../drugs/formulary.js';
import { getAudioStorage } from '../storage/index.js';
import { getSttProvider } from '../stt/index.js';
import type { ConsultationContext, PrescriptionItem } from '../novascribe.types.js';
import { understandTranscript } from './understanding.js';
import { verifyPrescriptionGrounding } from './verification.js';

const errMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

/**
 * Stages 2–4: understanding → drug validation → verification → persist DRAFTED.
 * Shared by both the audio and the pasted-transcript entry points.
 */
export const runTranscriptPipeline = async (
  clinicId: string,
  noteId: string,
  transcript: string,
  context?: ConsultationContext
): Promise<void> => {
  const db = forClinic(clinicId);

  const understanding = await understandTranscript(transcript, context);

  // Drug validation (formulary) — flag unknowns, attach canonical names.
  let prescription: PrescriptionItem[] = understanding.prescription.map((item) => {
    const v = validateDrug(item.drug);
    return {
      ...item,
      flagged: item.flagged || v.flagged,
      ...(v.canonical ? { canonical: v.canonical } : {})
    };
  });

  // Verification pass — flag medicines not grounded in the transcript.
  prescription = await verifyPrescriptionGrounding(transcript, prescription);

  await db.consultationNote.update({
    where: { id: noteId, clinicId },
    data: {
      transcript,
      subjective: understanding.sections.subjective,
      objective: understanding.sections.objective,
      assessment: understanding.sections.assessment,
      plan: understanding.sections.plan,
      prescription: prescription as unknown as Prisma.InputJsonValue,
      evidence: understanding.evidence as unknown as Prisma.InputJsonValue,
      status: ConsultationNoteStatus.DRAFTED,
      errorMessage: null
    }
  });
};

/**
 * Full pipeline from an uploaded audio key: STT → (shared spine). Marks the note
 * FAILED on any error so the UI can show it and offer a retry.
 */
export const processAudioPipeline = async (
  clinicId: string,
  noteId: string,
  audioKey: string,
  languageHint?: string,
  context?: ConsultationContext
): Promise<void> => {
  const db = forClinic(clinicId);
  try {
    const audio = await getAudioStorage().read(audioKey);
    const stt = await getSttProvider().transcribe({ audio, languageHint });

    await db.consultationNote.update({
      where: { id: noteId, clinicId },
      data: {
        transcript: stt.text,
        language: stt.language ?? languageHint ?? null,
        durationSec: stt.durationSec ?? null,
        segments: (stt.segments ?? null) as unknown as Prisma.InputJsonValue
      }
    });

    await runTranscriptPipeline(clinicId, noteId, stt.text, context);
  } catch (err) {
    await db.consultationNote.update({
      where: { id: noteId, clinicId },
      data: { status: ConsultationNoteStatus.FAILED, errorMessage: errMessage(err) }
    });
    throw err;
  }
};
