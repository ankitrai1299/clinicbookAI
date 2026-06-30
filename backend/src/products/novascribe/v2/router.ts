// NovaScribe v2 API — the reference app's contract, served on the main backend
// (auth + per-clinic scoping) backed by Postgres (NovaDoc) + OpenAI Whisper.
// Mounted at /api/nova. Audio files are served UNPROTECTED via a static route
// (see app.ts) because <audio> elements can't send an auth header.

import { promises as fsp } from 'fs';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { Request, Response, Router } from 'express';
import multer from 'multer';

import { requireAuth } from '../../../middleware/auth.js';
import { AppError } from '../../../utils/AppError.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import {
  consultationsRepo, patientsRepo, prescriptionsRepo, reportsRepo, transcriptsRepo
} from './repo.js';
import { transcribeAudio } from './whisper.js';
import { generateMedicalReport } from './report.js';
import { translateTranscript } from './translate.js';
import { buildPatientHistory } from './patientHistory.js';

// Default to a writable temp dir — works under the unprivileged container user
// (the app dir is root-owned + read-only at runtime). Audio is ephemeral anyway
// (move to object storage for durable replay). Override with NOVASCRIBE_AUDIO_DIR.
export const NOVA_UPLOADS_DIR = path.resolve(
  process.env.NOVASCRIBE_AUDIO_DIR ?? path.join(os.tmpdir(), 'novascribe-uploads')
);
// Best-effort at boot; never throw (a non-writable path must not crash startup).
try {
  fs.mkdirSync(NOVA_UPLOADS_DIR, { recursive: true });
} catch {
  /* created lazily on first write; persistence simply degrades if it fails */
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

const clinicOf = (req: Request): string => {
  const clinicId = req.user?.clinicId;
  if (!clinicId) throw new AppError('Authentication required', 401);
  return clinicId;
};

const AUDIO_MIME_EXT: Record<string, string> = {
  'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/wav': '.wav', 'audio/x-wav': '.wav',
  'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a', 'audio/webm': '.webm', 'audio/ogg': '.ogg'
};
const audioExt = (name?: string, mime?: string): string =>
  (name ? path.extname(name).toLowerCase() : '') || AUDIO_MIME_EXT[(mime || '').toLowerCase()] || '.webm';

export const novaRouter = Router();

novaRouter.use(requireAuth);

novaRouter.get('/health', (_req, res) => res.json({ success: true, status: 'running', database: 'postgres' }));

// ── Transcription (Whisper) ──────────────────────────────────────
novaRouter.post('/transcribe', upload.single('audio'), asyncHandler(async (req: Request, res: Response) => {
  const clinicId = clinicOf(req);
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) throw new AppError('No audio file provided', 400);
  if (file.size < 2000) throw new AppError('Audio file too small or empty', 400);

  const text = await transcribeAudio(file.buffer, file.mimetype, req.body?.language);

  let audioUrl = '';
  if (req.body?.persist === 'true' || req.body?.persist === true) {
    // Persisting is best-effort: storage failure must not fail the transcription.
    try {
      const safeId = String(req.body?.consultationId || 'audio').replace(/[^a-zA-Z0-9_-]/g, '');
      const fileName = `${clinicId.slice(0, 8)}-${safeId}-${Date.now()}${audioExt(file.originalname, file.mimetype)}`;
      await fsp.mkdir(NOVA_UPLOADS_DIR, { recursive: true });
      await fsp.writeFile(path.join(NOVA_UPLOADS_DIR, fileName), file.buffer);
      audioUrl = `/api/nova/uploads/${fileName}`;
    } catch (err) {
      console.error('[nova.transcribe] audio persist failed (continuing):', err);
    }
  }

  res.json({ rawText: text, transcript: text, audioUrl });
}));

novaRouter.delete('/uploads/:filename', asyncHandler(async (req: Request, res: Response) => {
  clinicOf(req);
  const safeName = path.basename(req.params.filename || '');
  if (!safeName) throw new AppError('Invalid file name', 400);
  await fsp.rm(path.join(NOVA_UPLOADS_DIR, safeName), { force: true }).catch(() => undefined);
  res.json({ ok: true });
}));

// ── Translate + report ───────────────────────────────────────────
novaRouter.post('/translate-transcript', asyncHandler(async (req: Request, res: Response) => {
  clinicOf(req);
  const { text, targetLanguage } = req.body ?? {};
  if (!text || !String(text).trim()) throw new AppError('text is required', 400);
  res.json({ translatedText: await translateTranscript(String(text), targetLanguage) });
}));

novaRouter.post('/generate-report', asyncHandler(async (req: Request, res: Response) => {
  clinicOf(req);
  const { transcript } = req.body ?? {};
  if (!transcript) throw new AppError('Transcript is required', 400);
  res.json(await generateMedicalReport(String(transcript)));
}));

// ── Patients ─────────────────────────────────────────────────────
novaRouter.get('/patients', asyncHandler(async (req: Request, res: Response) => {
  res.json(await patientsRepo.findAll(clinicOf(req)));
}));
novaRouter.post('/patients', asyncHandler(async (req: Request, res: Response) => {
  const clinicId = clinicOf(req);
  if (!req.body?.id) throw new AppError('patient.id is required', 400);
  await patientsRepo.upsert(clinicId, req.body, true); // replace
  res.json({ success: true });
}));
novaRouter.get('/patients/:patientId/history', asyncHandler(async (req: Request, res: Response) => {
  const clinicId = clinicOf(req);
  const order = req.query.order === 'desc' ? 'desc' : 'asc';
  res.json(await buildPatientHistory(clinicId, req.params.patientId, order));
}));

// ── Consultations ────────────────────────────────────────────────
novaRouter.get('/consultations', asyncHandler(async (req: Request, res: Response) => {
  res.json(await consultationsRepo.findAll(clinicOf(req)));
}));
novaRouter.post('/save-consultation', asyncHandler(async (req: Request, res: Response) => {
  const clinicId = clinicOf(req);
  if (!req.body?.id) throw new AppError('consultation.id is required', 400);
  await consultationsRepo.upsert(clinicId, req.body); // merge
  res.json({ success: true });
}));

// ── Generic collections: reports / prescriptions / transcripts ────
const collection = (name: string, repo: typeof reportsRepo) => {
  novaRouter.get(`/${name}`, asyncHandler(async (req: Request, res: Response) => {
    res.json(await repo.findAll(clinicOf(req)));
  }));
  novaRouter.post(`/${name}`, asyncHandler(async (req: Request, res: Response) => {
    const clinicId = clinicOf(req);
    if (!req.body?.id) throw new AppError('id is required', 400);
    await repo.upsert(clinicId, req.body);
    res.json({ success: true });
  }));
};
collection('reports', reportsRepo);
collection('prescriptions', prescriptionsRepo);
collection('transcripts', transcriptsRepo);

// ── Dashboard stats ──────────────────────────────────────────────
novaRouter.get('/stats', asyncHandler(async (req: Request, res: Response) => {
  const clinicId = clinicOf(req);
  const [patients, consultations, reports, prescriptions, transcripts] = await Promise.all([
    patientsRepo.count(clinicId), consultationsRepo.count(clinicId), reportsRepo.count(clinicId),
    prescriptionsRepo.count(clinicId), transcriptsRepo.count(clinicId)
  ]);
  res.json({ patients, consultations, reports, prescriptions, transcripts });
}));
