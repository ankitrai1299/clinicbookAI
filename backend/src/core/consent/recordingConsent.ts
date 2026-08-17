// The gate on recording a consultation.
//
// This is the one consent in the system that a clinic can be REFUSED for, and
// the reasoning behind how it is rolled out matters more than the code.
//
// Recording a doctor-patient conversation without telling the patient is the
// single largest exposure in this product — it is actionable outside data
// protection law, not only under it. So the gate exists and the server enforces
// it, not the UI.
//
// But it is OFF by default, per clinic, because of a constraint that cannot be
// engineered away: the native MediScribe app is reproduced byte-for-byte from
// its reference and must not be edited, so it has no consent screen and no way
// to send one. Turning enforcement on globally would stop every doctor using
// that app from recording anything, on the day it shipped. The web scribe DOES
// capture consent (and does so whether or not enforcement is on), so the data is
// being collected everywhere from now on; enforcement is the second step, taken
// per clinic once its doctors are on a surface that can ask.
//
// Enable with CONSENT_ENFORCE_RECORDING_CLINICS:
//   unset / blank  → off everywhere (today's behaviour)
//   "all"          → on for every clinic
//   "c1,c2"        → on for those clinic ids
//
// The same strangler-fig shape as MCP_BRAIN_NUMBERS and EMR_MOCK_CLINICS, so
// there is one rollout idiom in this codebase rather than three.

import { AppError } from '../../utils/AppError.js';
import { consentStatus } from './consent.service.js';

const parseList = (): { all: boolean; ids: Set<string> } => {
  const raw = (process.env.CONSENT_ENFORCE_RECORDING_CLINICS || '').trim();
  if (!raw) return { all: false, ids: new Set() };
  const entries = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (entries.some((e) => e.toLowerCase() === 'all')) return { all: true, ids: new Set() };
  return { all: false, ids: new Set(entries) };
};

/** Is the recording-consent gate enforced for this clinic? Read per call, so a config change needs no redeploy of logic. */
export const recordingConsentEnforced = (clinicId: string | null | undefined): boolean => {
  if (!clinicId) return false;
  const { all, ids } = parseList();
  return all || ids.has(clinicId);
};

/**
 * Throw 403 unless this patient has consented to being recorded.
 *
 * Two cases pass without a consent row and both are deliberate:
 *
 *  • Enforcement is off for the clinic (see above).
 *  • There is no patient id yet. A doctor recording a walk-in before the patient
 *    record exists has nobody to have consented — refusing would block a real
 *    clinical workflow to satisfy a check that cannot be answered. The consent
 *    is captured when the note is attached to a patient.
 *
 * The message names what to do, because a doctor who cannot record and is told
 * only "forbidden" will conclude the app is broken.
 */
export const requireRecordingConsent = async (
  clinicId: string,
  patientId: string | null | undefined
): Promise<void> => {
  if (!recordingConsentEnforced(clinicId)) return;
  if (!patientId) return;

  const status = await consentStatus(clinicId, patientId, 'consultation_recording');
  if (status === 'granted') return;

  throw new AppError(
    status === 'withdrawn'
      ? 'This patient has withdrawn consent for their consultations to be recorded.'
      : 'Recording consent has not been recorded for this patient. Confirm the patient has been told, then start again.',
    403
  );
};
