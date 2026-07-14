// MediScribe API — the reference app's Express server ported to a Router mounted
// on the main ClinicBook backend at /api/mediscribe. Every request is
// authenticated by ClinicBook's requireAuth (applied at the mount) and then
// bridged (req.auth + tenant clinicId) here, so all data is per-clinic. Audio
// files are served UNPROTECTED via a static route (see app.ts) because <audio>
// elements can't send an auth header.

import os from 'os';
import path from 'path';
import fs from 'fs';

import express, { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';

import { bridgeAuth } from './middleware/auth.js';
import { currentClinicId } from './context.js';
import authRouter from './routes/auth.js';
import adminRouter from './routes/admin.js';
import {
  patientsRepo,
  consultationsRepo,
  transcriptsRepo,
  reportsRepo,
  prescriptionsRepo
} from './repositories/index.js';
import { logUsage, pushNotification } from './services/events.js';
import {
  listClinicPatients,
  createClinicPatient,
  listClinicDoctors,
  listUpcomingAppointments
} from './clinicData.js';
import { syncFromScribeConsultation } from '../../services/medicineReminder.service.js';

// 25 MB ceiling — matches the client-side limit for uploaded audio files.
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_AUDIO_BYTES } });

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

// Delete a persisted upload audio file (best-effort).
mediscribeRouter.delete('/uploads/:filename', (req, res) => {
  const safeName = path.basename(req.params.filename || '');
  if (!safeName) return res.status(400).json({ error: 'Invalid file name' });
  try {
    fs.rmSync(path.join(MEDISCRIBE_UPLOADS_DIR, safeName), { force: true });
    return res.json({ ok: true });
  } catch (error) {
    console.error('[mediscribe:uploads:delete]', error);
    return res.json({ ok: false });
  }
});

// ── Transcription (Sarvam STT) ───────────────────────────────
mediscribeRouter.post('/transcribe', upload.single('audio'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No audio file provided' });

    const { accepted } = checkAudioFile(req.file.originalname, req.file.mimetype);
    if (!accepted) return res.status(400).json({ error: 'Please upload a valid audio file.' });
    if (req.file.size < 2000) return res.status(400).json({ error: 'Audio file too small or empty' });

    const { transcribeAudio } = await import('./services/sarvamStt.js');
    const text = await transcribeAudio(req.file.buffer, req.file.mimetype, req.body?.language);

    let audioUrl = '';
    if (req.body?.persist === 'true' || req.body?.persist === true) {
      const ext = audioExtension(req.file.originalname, req.file.mimetype);
      const safeId = String(req.body?.consultationId || 'audio').replace(/[^a-zA-Z0-9_-]/g, '');
      const fileName = `${safeId}-${Date.now()}${ext}`;
      fs.writeFileSync(path.join(MEDISCRIBE_UPLOADS_DIR, fileName), req.file.buffer);
      audioUrl = `/api/mediscribe/uploads/${fileName}`;
    }

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

// ── Report generation (Sarvam) ───────────────────────────────
mediscribeRouter.post('/generate-report', async (req: Request, res: Response) => {
  try {
    const { transcript } = req.body;
    if (!transcript) return res.status(400).json({ error: 'Transcript is required' });
    const { generateMedicalReport } = await import('./services/report.js');
    const report = await generateMedicalReport(transcript);
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
mediscribeRouter.get('/patients', async (_req: Request, res: Response) => {
  try { return res.json(await listClinicPatients(currentClinicId())); }
  catch (error) { console.error('[mediscribe:patients]', error); return res.json([]); }
});

// Adding a patient in the scribe creates a REAL ClinicBook patient (shared both
// ways) and returns it with the ClinicBook id so the consultation links to it.
mediscribeRouter.post('/patients', async (req: Request, res: Response) => {
  try {
    const { name, phone, age, gender } = req.body ?? {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'name is required' });
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
mediscribeRouter.get('/appointments/upcoming', async (req: Request, res: Response) => {
  try { return res.json(await listUpcomingAppointments(currentClinicId())); }
  catch (error) { console.error('[mediscribe:upcoming]', error); return res.json([]); }
});

mediscribeRouter.get('/patients/:patientId/history', async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;
    if (!patientId) return res.status(400).json({ error: 'patientId is required' });
    const order = req.query.order === 'desc' ? 'desc' : 'asc';
    const { buildPatientHistory } = await import('./services/patientHistory.js');
    return res.json(await buildPatientHistory(patientId, order));
  } catch (error) {
    console.error('[mediscribe:patient-history]', error);
    return res.status(500).json({ error: 'Failed to load consultation history' });
  }
});

// ── Consultations ────────────────────────────────────────────
mediscribeRouter.get('/consultations', async (_req: Request, res: Response) => {
  try { return res.json(await consultationsRepo.findAll()); }
  catch (error) { console.error('[mediscribe:consultations]', error); return res.json([]); }
});

mediscribeRouter.post('/save-consultation', async (req: Request, res: Response) => {
  try {
    const consultation = req.body;
    if (!consultation?.id) return res.status(400).json({ error: 'consultation.id is required' });
    const existing = await consultationsRepo.findById(consultation.id);
    const isNew = !existing;

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
    await consultationsRepo.upsert(consultation);
    if (isNew) pushNotification('new_consultation', 'New consultation', `Session started for ${consultation.patientName || 'a patient'}`, { consultationId: consultation.id });
    // Schedule WhatsApp medicine reminders from a finalized prescription
    // (fire-and-forget — a reminder failure must never fail the save).
    void syncFromScribeConsultation(currentClinicId(), consultation).catch((e) =>
      console.error('[mediscribe:save-consultation] reminder sync failed:', e)
    );
    return res.json({ success: true });
  } catch (error) {
    console.error('[mediscribe:save-consultation]', error);
    return res.status(500).json({ error: 'Failed to save consultation' });
  }
});

// ── Generic collections: reports, prescriptions, transcripts ─
function registerCollection(name: string, repo: typeof reportsRepo) {
  mediscribeRouter.get(`/${name}`, async (_req: Request, res: Response) => {
    try { return res.json(await repo.findAll()); }
    catch (error) { console.error(`[mediscribe:${name}]`, error); return res.json([]); }
  });
  mediscribeRouter.post(`/${name}`, async (req: Request, res: Response) => {
    try {
      const doc = req.body;
      if (!doc?.id) return res.status(400).json({ error: 'id is required' });
      await repo.upsert(doc);
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
mediscribeRouter.post('/render-pdf', express.json({ limit: '8mb' }), async (req: Request, res: Response) => {
  try {
    const html = req.body?.html;
    if (typeof html !== 'string' || !html.trim()) {
      return res.status(400).json({ error: 'html is required' });
    }
    const { renderHtmlToPdf } = await import('./pdf.render.js');
    const pdf = await renderHtmlToPdf(html);
    const raw = typeof req.body?.filename === 'string' ? req.body.filename : 'report.pdf';
    const filename = raw.replace(/[^a-z0-9._-]/gi, '_') || 'report.pdf';
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
