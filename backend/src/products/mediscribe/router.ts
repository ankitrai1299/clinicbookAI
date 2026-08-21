// MediScribe API — the reference app's Express server ported to a Router mounted
// on the main ClinicBook backend at /api/mediscribe. Every request is
// authenticated by ClinicBook's requireAuth (applied at the mount) and then
// bridged (req.auth + tenant clinicId) here, so all data is per-clinic.
//
// Consultation audio is NOT public. It is served from GET /audio/* behind the
// same authentication as everything else, gated on `recording.read`, checked
// against the caller's clinic, and audited — with a short-lived signature as a
// second lock. The web client fetches it with its token and plays from an object
// URL, because an <audio> element cannot send a header.

import os from 'os';
import path from 'path';
import fs from 'fs';

import express, { Router, type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'crypto';

import { bridgeAuth, type AuthedRequest } from './middleware/auth.js';
import { uploadAudio } from './middleware/upload.js';
import { requirePermission } from './middleware/authz.js';
import { recordFromRequest } from '../../core/audit/audit.service.js';
import { eventBus } from '../../core/events/eventBus.js';
import { requireRecordingConsent } from '../../core/consent/recordingConsent.js';
import { recordAiDraft, diffAgainstDraft, contentHash } from './services/aiAuditTrail.js';
import type { Role } from './contracts/index.js';
import { currentClinicId } from './context.js';
import { storage, objectKey, clinicOfKey, signedPath, verifySignature } from '../../core/storage/index.js';
import authRouter from './routes/auth.js';
import adminRouter from './routes/admin.js';
import {
  patientsRepo,
  consultationsRepo,
  transcriptsRepo,
  reportsRepo,
  prescriptionsRepo,
  usersRepo
} from './repositories/index.js';
import { logUsage, pushNotification } from './services/events.js';
import {
  listClinicPatients,
  createClinicPatient,
  findClinicPatientByPhone,
  listClinicDoctors,
  listUpcomingAppointments,
  findDoctorForLogin
} from './clinicData.js';
import { syncFromScribeConsultation } from '../../services/medicineReminder.service.js';
import { sendPrescriptionOnFinalize, deliverPrescription } from './services/prescriptionDelivery.js';
import { emitEvent, getPatientTimeline } from '../../core/timeline/patientTimeline.service.js';
import { createAppointment } from '../../core/appointments/appointment.service.js';
import { completeAppointmentForConsultation } from './appointmentCompletion.js';
import { askAssistant } from './services/assistant.js';
import {
  buildDoctorAnalytics,
  parseDay,
  withinRange,
  type CountableConsultation
} from './services/doctorAnalytics.js';

// Audio uploads go through middleware/upload.ts, never through multer directly —
// multer drops the tenant context and it has to be restored. See that file.

// Where uploaded audio is persisted for replay. A writable temp dir by default
// (the prod container's app dir is read-only); override with MEDISCRIBE_AUDIO_DIR.
export const MEDISCRIBE_UPLOADS_DIR = path.resolve(
  process.env.MEDISCRIBE_AUDIO_DIR ?? path.join(os.tmpdir(), 'mediscribe-uploads')
);
try {
  fs.mkdirSync(MEDISCRIBE_UPLOADS_DIR, { recursive: true });
} catch {
  /* created lazily on first write; persistence degrades gracefully if it fails */
}

// Pick a sensible file extension for a persisted upload.
const AUDIO_MIME_EXT: Record<string, string> = {
  'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/wav': '.wav', 'audio/x-wav': '.wav',
  'audio/wave': '.wav', 'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a', 'audio/webm': '.webm', 'audio/ogg': '.ogg'
};
function audioExtension(originalName?: string, mimetype?: string): string {
  const fromName = originalName ? path.extname(originalName).toLowerCase() : '';
  if (fromName) return fromName;
  return AUDIO_MIME_EXT[(mimetype || '').toLowerCase()] || '.webm';
}

// Server-side audio acceptance — mirrors the frontend check.
const ACCEPTED_AUDIO_MIME = new Set([
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/mp4', 'audio/m4a',
  'audio/x-m4a', 'audio/webm', 'audio/ogg', 'audio/aac', 'audio/flac', 'audio/3gpp', 'audio/amr', 'audio/opus'
]);
const ACCEPTED_AUDIO_EXT = new Set([
  '.mp3', '.mpeg', '.wav', '.m4a', '.webm', '.ogg', '.aac', '.flac', '.mp4', '.3gp', '.amr', '.opus'
]);
function checkAudioFile(originalName?: string, mimetype?: string): { accepted: boolean; reason: string } {
  const mime = (mimetype || '').toLowerCase();
  const ext = originalName ? path.extname(originalName).toLowerCase() : '';
  if (mime.startsWith('audio/')) return { accepted: true, reason: `MIME ${mime}` };
  if (mime === 'video/mpeg' && (ext === '.mpeg' || ext === '.mp3')) {
    return { accepted: true, reason: `video/mpeg with ${ext}` };
  }
  if (ACCEPTED_AUDIO_MIME.has(mime)) return { accepted: true, reason: `allowed MIME ${mime}` };
  if (ACCEPTED_AUDIO_EXT.has(ext)) return { accepted: true, reason: `extension ${ext}` };
  return { accepted: false, reason: `unrecognised audio (mime=${mime || 'empty'}, ext=${ext || 'none'})` };
}

// ── Doctor attribution / data isolation ──────────────────────
// Every consultation is stamped with the DOCTOR who recorded it (the logged-in
// user). A Doctor then only ever sees THEIR OWN patients + sessions + reports —
// one doctor's patients never mix with another's — while admins see everything
// (with the attending doctor shown). This resolves the effective MediScribe role
// + display name the same way /me does (an admin-assigned role wins the default).
interface Principal { id: string; role: Role; name: string; }
async function resolvePrincipal(req: AuthedRequest): Promise<Principal> {
  const auth = req.auth!;
  const stored = (await usersRepo.findById(auth.userId)) as { role?: Role; name?: string } | null;
  return {
    id: auth.userId,
    role: (stored?.role ?? auth.role) as Role,
    name: (stored?.name && String(stored.name).trim()) || auth.email.split('@')[0]
  };
}

// The set of consultation ids + patient ids that belong to this doctor — used to
// scope the report/transcript/prescription collections (which link by
// consultationId / id / patientId) down to just the doctor's own records.
async function doctorScopeKeys(doctorId: string): Promise<{ consultIds: Set<string>; patientIds: Set<string> }> {
  const cons = (await consultationsRepo.findAll()) as Array<{ id: string; patientId?: string; doctorId?: string }>;
  const mine = cons.filter((c) => c.doctorId === doctorId);
  return {
    consultIds: new Set(mine.map((c) => c.id)),
    patientIds: new Set(mine.map((c) => c.patientId).filter(Boolean) as string[])
  };
}

// A collection record (report/transcript/prescription) belongs to the doctor when
// it links to one of the doctor's consultations (by consultationId or shared id)
// or one of the doctor's patients.
const belongsToDoctor = (
  rec: { id?: string; consultationId?: string; patientId?: string },
  keys: { consultIds: Set<string>; patientIds: Set<string> }
): boolean =>
  (!!rec.consultationId && keys.consultIds.has(rec.consultationId)) ||
  (!!rec.id && keys.consultIds.has(rec.id)) ||
  (!!rec.patientId && keys.patientIds.has(rec.patientId));

export const mediscribeRouter = Router();

// Bridge the ClinicBook session (applied upstream) into this module's principal
// and bind the tenant clinicId for the whole request. Never cache API responses.
mediscribeRouter.use(bridgeAuth);
mediscribeRouter.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Sub-routers (become /api/mediscribe/auth/* and /api/mediscribe/admin/*).
mediscribeRouter.use('/auth', authRouter);
mediscribeRouter.use('/admin', adminRouter);

mediscribeRouter.get('/health', (_req, res) =>
  res.json({ success: true, status: 'running', database: 'postgres', timestamp: new Date().toISOString() })
);

mediscribeRouter.get('/config-test', (_req, res) =>
  res.json({ sarvam: !!(process.env.SARVAM_API_KEY || '').trim(), database: 'postgres' })
);

// Play back a stored consultation recording.
//
// Reached by an <audio> element, which cannot send an Authorization header, so
// the URL carries a short-lived signature instead (see core/storage). TWO checks
// have to pass: the signature must be ours and unexpired, and the key must
// belong to the clinic making the request — a valid signature for one clinic's
// recording is still refused inside another's session.
mediscribeRouter.get(/^\/audio\/(.+)$/, requirePermission('recording.read'), async (req: Request, res: Response) => {
  const key = decodeURI(String((req.params as unknown as string[])[0] || ''));
  const check = verifySignature(key, req.query.e as string, req.query.s as string);
  if (check !== 'ok') {
    return res.status(check === 'expired' ? 410 : 403).json({
      error: check === 'expired' ? 'This audio link has expired. Reopen the consultation.' : 'Invalid audio link.'
    });
  }
  if (clinicOfKey(key) !== currentClinicId()) {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const obj = await storage().get(key);
    if (!obj) return res.status(404).json({ error: 'Recording not found. It may have been deleted.' });

    // Listening to a recording of a patient's visit is a patient-data access and
    // is audited as one. Recorded on the SUCCESSFUL read only — a 404 or a bad
    // signature is not an access.
    recordFromRequest(req, {
      action: 'RECORDING_ACCESSED',
      resourceType: 'recording',
      resourceId: key,
      metadata: { bytes: obj.body.length }
    });

    res.setHeader('Content-Type', obj.contentType);
    res.setHeader('Content-Length', String(obj.body.length));
    // Private: this is patient audio, so no shared cache may keep a copy.
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    return res.end(obj.body);
  } catch (error) {
    console.error('[mediscribe:audio]', error);
    return res.status(500).json({ error: 'Could not read the recording.' });
  }
});

// Delete a stored recording (best-effort). Scoped to the caller's clinic, so a
// filename alone is not enough to destroy another clinic's audio.
mediscribeRouter.delete(
  /^\/audio\/(.+)$/,
  requirePermission('recording.delete'),
  async (req: Request, res: Response) => {
  const key = decodeURI(String((req.params as unknown as string[])[0] || ''));
  if (!key || clinicOfKey(key) !== currentClinicId()) {
    return res.status(404).json({ error: 'Not found' });
  }
  try {
    await storage().delete(key);
    // Destroying evidence of a consultation is exactly the kind of action an
    // audit trail exists for.
    recordFromRequest(req, {
      action: 'RECORDING_DELETED',
      resourceType: 'recording',
      resourceId: key
    });
    return res.json({ ok: true });
  } catch (error) {
    console.error('[mediscribe:audio:delete]', error);
    return res.json({ ok: false });
  }
  }
);

// ── Transcription (Sarvam STT) ───────────────────────────────
// The permission check runs BEFORE multer, so a caller who may not record never
// gets to upload 25 MB first and be refused afterwards.
mediscribeRouter.post('/transcribe', requirePermission('consultation.write'), uploadAudio('audio'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No audio file provided' });

    const { accepted } = checkAudioFile(req.file.originalname, req.file.mimetype);
    if (!accepted) return res.status(400).json({ error: 'Please upload a valid audio file.' });
    if (req.file.size < 2000) return res.status(400).json({ error: 'Audio file too small or empty' });

    // Consent to be recorded, checked on the SERVER before the audio is sent to
    // a transcription vendor. Off by default per clinic — see
    // core/consent/recordingConsent.ts for why that rollout is staged.
    await requireRecordingConsent(currentClinicId(), req.body?.patientId ? String(req.body.patientId) : null);

    const { transcribeAudio } = await import('./services/sarvamStt.js');
    const text = await transcribeAudio(req.file.buffer, req.file.mimetype, req.body?.language);

    let audioUrl = '';
    if (req.body?.persist === 'true' || req.body?.persist === true) {
      const ext = audioExtension(req.file.originalname, req.file.mimetype);
      const safeId = String(req.body?.consultationId || 'audio').replace(/[^a-zA-Z0-9_-]/g, '');
      // randomUUID, not Date.now(): two doctors saving in the same millisecond
      // would otherwise overwrite each other, and a guessable name was the only
      // thing protecting the old unauthenticated mount.
      const fileName = `${safeId}-${randomUUID()}${ext}`;
      const key = objectKey(currentClinicId(), 'consultations', fileName);
      await storage().put(key, req.file.buffer, req.file.mimetype || 'application/octet-stream');
      audioUrl = signedPath(key);

      recordFromRequest(req, {
        action: 'RECORDING_UPLOADED',
        resourceType: 'recording',
        resourceId: key,
        metadata: { bytes: req.file.size, consultationId: String(req.body?.consultationId || '') }
      });
    }

    // The transcript TEXT is what the patient said about their health, so only
    // its length is recorded here. The text itself is stored in the clinical
    // record like every other clinical document.
    recordFromRequest(req, {
      action: 'AI_TRANSCRIPT_GENERATED',
      actorType: 'ai',
      actorName: 'sarvam-stt',
      resourceType: 'transcript',
      resourceId: String(req.body?.consultationId || '') || null,
      metadata: {
        chars: text.length,
        language: String(req.body?.language || ''),
        audioBytes: req.file.size
      }
    });

    logUsage({ type: 'stt', consultationId: req.body?.consultationId || '', language: req.body?.language || '', bytes: req.file.size, success: true });
    return res.json({ rawText: text, transcript: text, audioUrl });
  } catch (error: any) {
    logUsage({ type: 'stt', consultationId: req.body?.consultationId || '', language: req.body?.language || '', success: false });
    pushNotification('failed_stt', 'STT failed', error?.detail || error?.message || 'Transcription failed', { consultationId: req.body?.consultationId || '' });
    const detail = error?.detail || error?.message || 'Transcription failed';
    console.error('[mediscribe:transcribe]', error?.status || '', detail);
    if (error?.status === 401 || error?.status === 403) {
      return res.status(401).json({ error: 'Invalid Sarvam API key. Check SARVAM_API_KEY.' });
    }
    return res.status(500).json({ error: detail });
  }
});

// ── Transcript translation ───────────────────────────────────
mediscribeRouter.post('/translate-transcript', async (req: Request, res: Response) => {
  try {
    const { text, targetLanguage } = req.body ?? {};
    if (!text || !text.toString().trim()) return res.status(400).json({ error: 'text is required' });
    const { translateTranscript } = await import('./services/translate.js');
    const translatedText = await translateTranscript(text.toString(), targetLanguage);
    return res.json({ translatedText });
  } catch (error: any) {
    console.error('[mediscribe:translate-transcript]', error);
    return res.status(502).json({ error: `Translation failed: ${error?.message || 'Unknown error'}` });
  }
});

// ── Speaker labelling (who said what) ────────────────────────
// Splits a transcript into Doctor/Patient turns. Additive and read-only: on any
// failure we return an empty list and the client keeps the plain transcript.
mediscribeRouter.post('/label-speakers', async (req: Request, res: Response) => {
  try {
    const { transcript } = req.body ?? {};
    if (!transcript || !String(transcript).trim()) {
      return res.status(400).json({ error: 'transcript is required' });
    }
    const { labelSpeakers } = await import('./services/speakerLabels.js');
    return res.json({ turns: await labelSpeakers(String(transcript)) });
  } catch (error: any) {
    console.error('[mediscribe:label-speakers]', error);
    return res.status(502).json({ error: error?.message || 'Could not identify speakers' });
  }
});

// ── Report generation (Sarvam) ───────────────────────────────
mediscribeRouter.post('/generate-report', requirePermission('consultation.write'), async (req: Request, res: Response) => {
  try {
    const { transcript } = req.body;
    if (!transcript) return res.status(400).json({ error: 'Transcript is required' });
    const { generateMedicalReport } = await import('./services/report.js');
    const report = await generateMedicalReport(transcript);

    // Keep what the AI proposed, BEFORE any doctor touches it — this is the
    // "before" half of the review trail. Awaited (not fire-and-forget) so the
    // draft is on disk before the doctor can possibly finalise; it never throws.
    await recordAiDraft({
      clinicId: currentClinicId(),
      transcript: String(transcript),
      report,
      model: process.env.SARVAM_MODEL || 'sarvam-105b'
    });

    logUsage({ type: 'ai_report', success: true });
    return res.json(report);
  } catch (error: any) {
    console.error('[mediscribe:generate-report]', error);
    logUsage({ type: 'ai_report', success: false });
    pushNotification('failed_report', 'AI report failed', error?.message || 'Report generation failed');
    const detail = error?.message || error?.error?.message || 'Unknown error while generating the report.';
    const status = error?.status ?? error?.code;
    if (status === 401 || status === 403) {
      return res.status(401).json({ error: 'Invalid Sarvam API key. Check SARVAM_API_KEY.' });
    }
    if (status === 429 || /quota|rate.?limit|too many requests/i.test(detail)) {
      return res.status(429).json({ error: 'Sarvam quota exceeded or rate limited. The transcript is preserved — try again shortly.' });
    }
    return res.status(502).json({ error: `Sarvam report generation failed: ${detail}` });
  }
});

// ── Patients (SHARED with ClinicBook — its Patient table is the source) ──
// A Doctor sees only the patients THEY have consulted (derived from their own
// consultations); admins/receptionists see the whole clinic list.
mediscribeRouter.get('/patients', async (req: AuthedRequest, res: Response) => {
  try {
    const all = await listClinicPatients(currentClinicId());
    const me = await resolvePrincipal(req);
    if (me.role !== 'doctor') return res.json(all);
    const { patientIds } = await doctorScopeKeys(me.id);
    return res.json(all.filter((p) => patientIds.has(p.id)));
  } catch (error) { console.error('[mediscribe:patients]', error); return res.json([]); }
});

// Adding a patient in the scribe creates a REAL ClinicBook patient (shared both
// ways) and returns it with the ClinicBook id so the consultation links to it.
mediscribeRouter.post('/patients', async (req: Request, res: Response) => {
  try {
    const { name, phone, age, gender } = req.body ?? {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'name is required' });

    // Duplicate guard — CLINIC-WIDE (not just this doctor's list): a number booked
    // via WhatsApp or added by another doctor also counts. Block with a clear
    // "already registered" so the same phone is never added twice.
    const dup = await findClinicPatientByPhone(currentClinicId(), typeof phone === 'string' ? phone : undefined);
    if (dup) {
      return res.status(409).json({
        error: `This phone number is already registered (${dup.name}).`,
        existed: true,
        patient: dup
      });
    }

    const patient = await createClinicPatient(currentClinicId(), {
      name: String(name).trim(),
      phone: typeof phone === 'string' ? phone : undefined,
      age: typeof age === 'number' ? age : undefined,
      gender: typeof gender === 'string' ? gender : undefined
    });
    pushNotification('new_patient', 'New patient', `${patient.name} was added`, { patientId: patient.id });
    return res.json({ success: true, patient });
  } catch (error) {
    console.error('[mediscribe:save-patient]', error);
    return res.status(500).json({ error: 'Failed to save patient' });
  }
});

// ── Doctors (SHARED — the clinic's doctors from ClinicBook) ──────────────
mediscribeRouter.get('/doctors', async (req: Request, res: Response) => {
  try { return res.json(await listClinicDoctors(currentClinicId())); }
  catch (error) { console.error('[mediscribe:doctors]', error); return res.json([]); }
});

// ── Upcoming appointments (from ClinicBook) — start a scribe session per visit ─
mediscribeRouter.get('/appointments/upcoming', async (req: AuthedRequest, res: Response) => {
  try {
    // A doctor sees only their own appointments (matched to a ClinicBook Doctor by
    // email); an admin/receptionist sees every doctor's.
    const me = await resolvePrincipal(req);
    const opts = me.role === 'doctor' ? { doctorEmail: req.auth?.email } : undefined;
    return res.json(await listUpcomingAppointments(currentClinicId(), opts));
  } catch (error) { console.error('[mediscribe:upcoming]', error); return res.json([]); }
});

// Whether this doctor's login is linked to a ClinicBook Doctor record. An empty
// queue is ambiguous — no bookings, or a broken link — and the dashboard cannot
// tell the difference without asking. Admins are never "unlinked" (they see
// every doctor's appointments), so they always report linked.
mediscribeRouter.get('/appointments/link-status', async (req: AuthedRequest, res: Response) => {
  try {
    const me = await resolvePrincipal(req);
    if (me.role !== 'doctor') return res.json({ linked: true, role: me.role });
    const email = req.auth?.email ?? '';
    const doctor = await findDoctorForLogin(currentClinicId(), email);
    return res.json({ linked: !!doctor, role: me.role, email, doctorName: doctor?.name ?? null });
  } catch (error) {
    console.error('[mediscribe:link-status]', error);
    // Fail as "linked" so a lookup blip never accuses a working account.
    return res.json({ linked: true, role: 'doctor' });
  }
});

mediscribeRouter.get('/patients/:patientId/history', async (req: AuthedRequest, res: Response) => {
  try {
    const { patientId } = req.params;
    if (!patientId) return res.status(400).json({ error: 'patientId is required' });
    const order = req.query.order === 'desc' ? 'desc' : 'asc';
    const { buildPatientHistory } = await import('./services/patientHistory.js');
    // A doctor sees only their OWN consultations for this patient — the same rule
    // the Sessions and Reports lists apply. Two doctors sharing a patient must not
    // read each other's notes just by opening the patient's history.
    const me = await resolvePrincipal(req);
    const scope = me.role === 'doctor' ? { doctorId: me.id } : {};
    return res.json(await buildPatientHistory(patientId, order, scope));
  } catch (error) {
    console.error('[mediscribe:patient-history]', error);
    return res.status(500).json({ error: 'Failed to load consultation history' });
  }
});

// Patient TIMELINE — the append-only event stream (registered / booked / visited /
// prescribed / …), newest first. The doctor's Patient Timeline UI reads this.
mediscribeRouter.get('/patients/:patientId/timeline', async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;
    if (!patientId) return res.status(400).json({ error: 'patientId is required' });
    return res.json(await getPatientTimeline(currentClinicId(), patientId));
  } catch (error) {
    console.error('[mediscribe:patient-timeline]', error);
    return res.json([]);
  }
});

// ── Consultations ────────────────────────────────────────────
// A Doctor sees only their own sessions; admins see all.
//
// Optional ?startDate=&endDate= (YYYY-MM-DD) narrows to a period, so a screen
// showing one week doesn't download years of history to throw most of it away.
// Omitting them returns everything, which is what the web dashboard does.
mediscribeRouter.get('/consultations', async (req: AuthedRequest, res: Response) => {
  try {
    const items = (await consultationsRepo.findAll()) as Array<{ doctorId?: string }>;
    const me = await resolvePrincipal(req);
    const mine = me.role === 'doctor' ? items.filter((c) => c.doctorId === me.id) : items;

    const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : undefined;
    const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : undefined;
    if (!startDate && !endDate) return res.json(mine);

    const start = parseDay(startDate);
    const end = parseDay(endDate);
    return res.json(mine.filter((c) => withinRange(c as CountableConsultation, start, end)));
  } catch (error) { console.error('[mediscribe:consultations]', error); return res.json([]); }
});

// The doctor's own summary figures for a period — the six numbers the phone
// dashboard shows. Scoped to the signed-in doctor exactly like /consultations
// above, so a card and the list it opens can never disagree.
mediscribeRouter.get('/analytics', async (req: AuthedRequest, res: Response) => {
  try {
    const me = await resolvePrincipal(req);
    const items = (await consultationsRepo.findAll()) as Array<{ doctorId?: string }>;
    const mine = me.role === 'doctor' ? items.filter((c) => c.doctorId === me.id) : items;

    return res.json(
      buildDoctorAnalytics(mine as CountableConsultation[], {
        startDate: typeof req.query.startDate === 'string' ? req.query.startDate : undefined,
        endDate: typeof req.query.endDate === 'string' ? req.query.endDate : undefined
      })
    );
  } catch (error) {
    console.error('[mediscribe:analytics]', error);
    // Six numbers are not worth an error dialog over a dashboard; an empty
    // summary renders as zeroes and the screen still works.
    return res.json(buildDoctorAnalytics([], {}));
  }
});

// The native app deletes a stored recording by FILENAME (its older backend kept
// uploads flat). Ours are clinic-scoped keys, so a bare filename cannot identify
// one — and guessing which file a name refers to could delete another clinic's
// audio. Answers ok so the app's best-effort cleanup never surfaces an error,
// and does nothing.
mediscribeRouter.delete('/uploads/:filename', (_req, res) => res.json({ ok: false }));

// Usage telemetry from the app (a report exported, a recording that failed).
// Fire-and-forget by contract: the client never surfaces a failure here, so a
// doctor sharing a PDF must never see an error because an event could not be
// written. Always 202, never a body worth reading.
mediscribeRouter.post('/events', async (req: AuthedRequest, res: Response) => {
  try {
    const type = String(req.body?.type ?? '').trim().slice(0, 60);
    if (type) {
      logUsage({
        type,
        consultationId: String(req.body?.consultationId ?? '').slice(0, 120),
        // Free text from the client — bounded, and never echoed back.
        detail: String(req.body?.detail ?? '').slice(0, 500),
        success: true
      });
    }
  } catch (error) {
    console.error('[mediscribe:events]', error);
  }
  return res.status(202).json({ ok: true });
});

// Ask the assistant a question about your own patients — spoken or typed.
//
// READ-ONLY by construction: this reaches no write path at all. A misheard word
// costs the doctor a re-ask, never a wrong prescription on someone's phone.
// '/chat' is the native app's name for the same thing; one handler answers to
// both so neither client has to change its spelling. Registered as two paths
// rather than by re-entering the router, which would run the auth bridge twice.
mediscribeRouter.post(['/ask', '/chat'], async (req: AuthedRequest, res: Response) => {
  try {
    const question = String(req.body?.question ?? '').trim();
    if (!question) return res.status(400).json({ error: 'question is required' });
    if (question.length > 500) return res.status(400).json({ error: 'question is too long' });

    const me = await resolvePrincipal(req);

    // The assistant answers with clinical content — diagnoses, prescriptions,
    // allergies. A receptionist has patients.view (names/phones) but NOT
    // reports.view or consultations.view, and must not reach clinical records
    // through this side door. Only clinical roles may ask.
    const CLINICAL_ROLES = new Set<Role>(['doctor', 'hospital_admin', 'superadmin']);
    if (!CLINICAL_ROLES.has(me.role)) {
      return res.status(403).json({ error: 'Not permitted to read clinical records' });
    }

    const result = await askAssistant({
      clinicId: currentClinicId(),
      doctorId: me.id,
      isDoctor: me.role === 'doctor',
      question,
      patientId: req.body?.patientId ? String(req.body.patientId) : undefined,
    });
    return res.json(result);
  } catch (error) {
    console.error('[mediscribe:ask]', error);
    return res.status(500).json({ error: 'Could not answer that just now' });
  }
});

// Send (or re-send) a finalized prescription to the patient on WhatsApp, on the
// doctor's explicit instruction. The automatic send on finalize stays as it is;
// this exists because the doctor previously had no way to see whether it went, no
// way to retry a failure, and no way to send it again when the patient asks.
mediscribeRouter.post('/consultations/:id/send-prescription', requirePermission('prescription.send'), async (req: AuthedRequest, res: Response) => {
  try {
    const consultation = (await consultationsRepo.findById(req.params.id)) as { doctorId?: string } | null;
    if (!consultation) return res.status(404).json({ error: 'Consultation not found' });

    // A doctor may only send their own patients' prescriptions.
    const me = await resolvePrincipal(req);
    if (me.role === 'doctor' && consultation.doctorId && consultation.doctorId !== me.id) {
      return res.status(403).json({ error: 'This consultation belongs to another doctor' });
    }

    const result = await deliverPrescription(currentClinicId(), consultation, { force: true });

    // Audited whether or not anything went out: "the doctor pressed Send and
    // nothing was sent because the patient has no phone" is a fact worth having.
    recordFromRequest(req, {
      action: 'PRESCRIPTION_SENT',
      resourceType: 'consultation',
      resourceId: req.params.id,
      patientId: (consultation as { patientId?: string })?.patientId ?? null,
      outcome: result.sent ? 'success' : 'failure',
      reason: result.sent ? null : (result.reason ?? 'not-sent'),
      metadata: { channel: result.channel ?? '', pdf: Boolean(result.pdfSent), manual: true }
    });

    return res.json(result);
  } catch (error) {
    console.error('[mediscribe:send-prescription]', error);
    return res.status(500).json({ error: 'Could not send the prescription' });
  }
});

// Book the follow-up the note already describes.
//
// `followUp.date` has always been free text that printed on the PDF and then did
// nothing — the doctor said "come back in a week" and someone still had to book it
// by hand, in an appointment system this app is already connected to. This closes
// that gap: the note's follow-up becomes a real ClinicBook appointment, which then
// gets the usual reminders like any other booking.
mediscribeRouter.post('/consultations/:id/follow-up', async (req: AuthedRequest, res: Response) => {
  try {
    const { doctorId, date, time } = req.body ?? {};
    if (!doctorId || !date || !time) {
      return res.status(400).json({ error: 'doctorId, date and time are required' });
    }

    const consultation = (await consultationsRepo.findById(req.params.id)) as
      | { doctorId?: string; patientId?: string; patientName?: string }
      | null;
    if (!consultation) return res.status(404).json({ error: 'Consultation not found' });
    if (!consultation.patientId) return res.status(400).json({ error: 'This consultation has no patient' });

    const me = await resolvePrincipal(req);
    if (me.role === 'doctor' && consultation.doctorId && consultation.doctorId !== me.id) {
      return res.status(403).json({ error: 'This consultation belongs to another doctor' });
    }

    const clinicId = currentClinicId();
    const appointment = await createAppointment(clinicId, {
      doctorId: String(doctorId),
      patientId: String(consultation.patientId),
      appointmentDate: String(date),
      appointmentTime: String(time),
    });

    // Remember it on the note so the UI can show "already booked" instead of
    // offering to book the same follow-up twice.
    await consultationsRepo.upsert({
      id: req.params.id,
      followUpAppointmentId: appointment.id,
      followUpBookedAt: new Date().toISOString(),
    } as any);

    emitEvent({
      clinicId,
      patientId: String(consultation.patientId),
      type: 'booked',
      title: `Follow-up booked — ${date} at ${time}`,
      actorType: 'doctor',
      actorName: me.name,
      refType: 'appointment',
      refId: appointment.id,
    });

    return res.json({ id: appointment.id, date, time });
  } catch (error) {
    // createAppointment throws AppError with a usable message (past slot, clash,
    // unknown doctor) — pass it through so the doctor can act on it.
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    const message = (error as Error)?.message ?? 'Could not book the follow-up';
    if (status >= 500) console.error('[mediscribe:follow-up]', error);
    return res.status(status).json({ error: message });
  }
});

mediscribeRouter.post('/save-consultation', requirePermission('consultation.write'), async (req: AuthedRequest, res: Response) => {
  try {
    const consultation = req.body;
    if (!consultation?.id) return res.status(400).json({ error: 'consultation.id is required' });
    const existing = await consultationsRepo.findById(consultation.id);
    const isNew = !existing;

    // Stamp the attending doctor once (the user who first records the session), and
    // backfill any legacy record that predates attribution. Never reassigned after.
    if (!(existing as { doctorId?: string } | null)?.doctorId && !consultation.doctorId) {
      const me = await resolvePrincipal(req);
      consultation.doctorId = me.id;
      consultation.doctorName = me.name;
    }

    // NEVER regress a finished consultation. A background auto-save carries
    // status 'Draft'/'Recording'/'Processing'; because the store shallow-merges,
    // such a late write would otherwise overwrite a 'Completed' record's status
    // and flatten its saved report — the "saved report still shows Draft" bug.
    // Drop the downgrading fields so the merge keeps the completed status +
    // report, while still accepting benign updates (transcript text, audio).
    if (
      (existing as { status?: string } | null)?.status === 'Completed' &&
      consultation.status &&
      consultation.status !== 'Completed'
    ) {
      delete consultation.status;
      delete consultation.report;
      delete consultation.prescriptions;
    }
    const wasCompleted = (existing as { status?: string } | null)?.status === 'Completed';
    await consultationsRepo.upsert(consultation);
    if (isNew) pushNotification('new_consultation', 'New consultation', `Session started for ${consultation.patientName || 'a patient'}`, { consultationId: consultation.id });

    // Timeline: first time this note is finalized (once, not on every re-save).
    if (!wasCompleted && consultation.status === 'Completed' && consultation.patientId) {
      const cc =
        (Array.isArray(consultation?.report?.chiefComplaint) && consultation.report.chiefComplaint[0]) ||
        (Array.isArray(consultation?.report?.chiefComplaints) && consultation.report.chiefComplaints[0]?.complaint) ||
        '';
      emitEvent({
        clinicId: currentClinicId(),
        patientId: String(consultation.patientId),
        type: 'note_finalized',
        title: cc ? `Consultation completed — ${cc}` : 'Consultation completed',
        actorType: 'doctor',
        actorName: consultation.doctorName ? String(consultation.doctorName).replace(/^dr\.?\s*/i, '') : undefined,
        refType: 'consultation',
        refId: String(consultation.id)
      });

      // THE APPROVAL ROW.
      //
      // Setting a note to Completed IS the doctor's approval — it is the act
      // that unlocks delivery (deliverPrescription refuses anything that is not
      // Completed). So this is where the review trail closes: which AI draft it
      // came from, which top-level fields the doctor altered, how many medicines
      // they added, removed or changed, and a hash of the exact version approved.
      //
      // actorType is 'user' and the actor is the signed-in doctor. No AI path can
      // reach this line: it runs inside an authenticated request handler, and the
      // matrix grants prescription.approve to doctors and clinic owners only.
      // Announce it. The notification feed subscribes; the event itself was
      // declared in the catalogue long ago and never actually fired.
      eventBus.emit('consultation.finalized', {
        clinicId: currentClinicId(),
        consultationNoteId: String(consultation.id),
        patientId: consultation.patientId ? String(consultation.patientId) : undefined
      });

      void diffAgainstDraft(currentClinicId(), consultation)
        .then((diff) => {
          recordFromRequest(req, {
            action: 'PRESCRIPTION_APPROVED',
            resourceType: 'consultation',
            resourceId: String(consultation.id),
            patientId: String(consultation.patientId),
            actorName: consultation.doctorName ? String(consultation.doctorName) : undefined,
            metadata: {
              draftId: diff.draftId ?? '',
              // False means the transcript changed after generation, so the
              // draft could not be matched — stated rather than hidden.
              draftLinked: diff.draftLinked,
              changedFields: diff.changedFields.join(','),
              medicinesAdded: diff.medicinesAdded,
              medicinesRemoved: diff.medicinesRemoved,
              medicinesModified: diff.medicinesModified,
              finalHash: diff.finalHash,
              draftHash: diff.draftHash ?? ''
            }
          });
        })
        .catch((e) => console.error('[mediscribe:ai-audit] approval diff failed:', e));

      // Close the ClinicBook appointment this visit belongs to, so staff never
      // have to click "Mark Completed" on the roster after the doctor is done.
      // Fire-and-forget: the roster must never block (or fail) the doctor's save.
      void completeAppointmentForConsultation(currentClinicId(), consultation)
        .then((r) => console.info('[mediscribe:auto-complete]', r.reason))
        .catch((e) => console.error('[mediscribe:auto-complete] failed:', e));
    }
    // Schedule WhatsApp medicine reminders from a finalized prescription
    // (fire-and-forget — a reminder failure must never fail the save).
    void syncFromScribeConsultation(currentClinicId(), consultation).catch((e) =>
      console.error('[mediscribe:save-consultation] reminder sync failed:', e)
    );
    // Send the finalized prescription to the patient's WhatsApp (once, best-effort).
    //
    // The automatic path still has a human behind it — it only fires because the
    // doctor finalised the note — so the audit row names that doctor as the
    // actor, with `manual: false` to distinguish it from pressing Send. A row is
    // written only when something was actually delivered; the routine no-ops
    // (draft re-save, already-sent) are not events.
    void sendPrescriptionOnFinalize(currentClinicId(), consultation)
      .then((sent) => {
        if (!sent) return;
        eventBus.emit('prescription.generated', {
          clinicId: currentClinicId(),
          prescriptionId: String(consultation.id),
          patientId: consultation.patientId ? String(consultation.patientId) : undefined
        });
        recordFromRequest(req, {
          action: 'PRESCRIPTION_SENT',
          resourceType: 'consultation',
          resourceId: String(consultation.id),
          patientId: consultation.patientId ? String(consultation.patientId) : null,
          actorName: consultation.doctorName ? String(consultation.doctorName) : undefined,
          metadata: { manual: false, finalHash: contentHash(consultation.report ?? null) }
        });
      })
      .catch((e) => console.error('[mediscribe:save-consultation] prescription send failed:', e));
    return res.json({ success: true });
  } catch (error) {
    console.error('[mediscribe:save-consultation]', error);
    return res.status(500).json({ error: 'Failed to save consultation' });
  }
});

// ── Generic collections: reports, prescriptions, transcripts ─
function registerCollection(name: string, repo: typeof reportsRepo) {
  // These three collections ARE the clinical record — reading them needs
  // consultation.read, writing them consultation.write. A receptionist holds
  // neither, which is the intended change: front-desk staff book visits, they do
  // not read reports.
  mediscribeRouter.get(`/${name}`, requirePermission('consultation.read'), async (req: AuthedRequest, res: Response) => {
    try {
      const items = await repo.findAll();
      const me = await resolvePrincipal(req);
      if (me.role !== 'doctor') return res.json(items);
      const keys = await doctorScopeKeys(me.id);
      return res.json(
        (items as Array<{ id?: string; consultationId?: string; patientId?: string }>).filter((r) =>
          belongsToDoctor(r, keys)
        )
      );
    } catch (error) { console.error(`[mediscribe:${name}]`, error); return res.json([]); }
  });
  mediscribeRouter.post(`/${name}`, requirePermission('consultation.write'), async (req: Request, res: Response) => {
    try {
      const doc = req.body;
      if (!doc?.id) return res.status(400).json({ error: 'id is required' });
      await repo.upsert(doc);
      // Editing a saved prescription after the fact is a clinical change and is
      // audited as one — by id and content hash, never by content.
      if (name === 'prescriptions') {
        recordFromRequest(req, {
          action: 'PRESCRIPTION_UPDATED',
          resourceType: 'prescription',
          resourceId: String(doc.id),
          patientId: doc.patientId ? String(doc.patientId) : null,
          metadata: { hash: contentHash(doc), consultationId: String(doc.consultationId ?? '') }
        });
      }
      return res.json({ success: true });
    } catch (error) {
      console.error(`[mediscribe:save-${name}]`, error);
      return res.status(500).json({ error: `Failed to save ${name}` });
    }
  });
}
registerCollection('reports', reportsRepo);
registerCollection('prescriptions', prescriptionsRepo);
registerCollection('transcripts', transcriptsRepo);

// ── Dashboard stats ──────────────────────────────────────────
mediscribeRouter.get('/stats', async (_req: Request, res: Response) => {
  try {
    const [patients, consultations, reports, prescriptions, transcripts] = await Promise.all([
      patientsRepo.count(), consultationsRepo.count(), reportsRepo.count(), prescriptionsRepo.count(), transcriptsRepo.count()
    ]);
    return res.json({ patients, consultations, reports, prescriptions, transcripts });
  } catch (error) {
    console.error('[mediscribe:stats]', error);
    return res.status(500).json({ error: 'Failed to load stats' });
  }
});

// ── PDF rendering ────────────────────────────────────────────
// The client posts the SAME report/transcript HTML it prints; headless Chrome
// renders it to a real, selectable-text PDF (identical layout to the print preview).
// Larger JSON body limit (reports can be a few hundred KB of HTML).
mediscribeRouter.post('/render-pdf', requirePermission('document.download'), express.json({ limit: '8mb' }), async (req: Request, res: Response) => {
  try {
    const html = req.body?.html;
    if (typeof html !== 'string' || !html.trim()) {
      return res.status(400).json({ error: 'html is required' });
    }
    const { renderHtmlToPdf } = await import('./pdf.render.js');
    const pdf = await renderHtmlToPdf(html);
    const raw = typeof req.body?.filename === 'string' ? req.body.filename : 'report.pdf';
    const filename = raw.replace(/[^a-z0-9._-]/gi, '_') || 'report.pdf';
    // A clinical document leaving the system as a file. The HTML that produced
    // it is the report text itself, so only its size and the file name are
    // recorded.
    recordFromRequest(req, {
      action: 'DOCUMENT_DOWNLOADED',
      resourceType: 'document',
      resourceId: String(req.body?.consultationId ?? '') || null,
      patientId: req.body?.patientId ? String(req.body.patientId) : null,
      metadata: { filename, bytes: pdf.length, kind: String(req.body?.kind ?? 'report') }
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(pdf.length));
    return res.end(pdf);
  } catch (error) {
    console.error('[mediscribe:render-pdf]', error);
    return res.status(500).json({ error: 'Failed to render PDF' });
  }
});

// Router-local error handler — oversized uploads (multer) → a clear 413.
mediscribeRouter.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Audio file is too large. Maximum size is 25MB.' });
  }
  console.error('[mediscribe:unhandled]', err);
  return res.status(500).json({ error: 'Internal server error' });
});
