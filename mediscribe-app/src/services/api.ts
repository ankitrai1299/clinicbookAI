import {
  ReportData,
  Patient,
  Consultation,
  ReportRecord,
  PrescriptionRecord,
  TranscriptRecord,
  TerminologyCorrection,
} from '../types';
import { AuthResponse, AuthUser } from '../contracts';
import { API_ROOT, API_BASE as BASE } from '../config';
import i18n from '../i18n';
import * as FileSystem from 'expo-file-system/legacy';

// A picked/recorded audio file as React Native's FormData expects it. RN builds
// the multipart body from this { uri, name, type } descriptor (the web app sent
// a Blob/File; the backend contract is identical — field name "audio").
export interface RNAudioFile {
  uri: string;
  name: string;
  type: string;
}

// ── Doctor-scoped API base ────────────────────────────────────
// Every clinical route lives under /api/doctor: it requires a JWT and filters
// each query by the doctorId inside that token, so this app can only ever see
// the signed-in doctor's own records. (The unprefixed /api/* paths are aliases
// of the same handlers, kept for the web client.)
const DOCTOR = `${BASE}/doctor`;

// ── Session token ─────────────────────────────────────────────
// Published by AuthProvider (src/context/Auth.tsx) on login, logout and session
// restore, so the ~15 exported data functions below don't each need a token
// argument threaded down from every screen that calls them.
let sessionToken: string | null = null;

/** Called by AuthProvider whenever the session changes. */
export function setSessionToken(token: string | null): void {
  sessionToken = token;
}

/** Current token — needed by the file-upload paths, which build headers by hand. */
export function getSessionToken(): string | null {
  return sessionToken;
}

/** Invoked when the server rejects our token, so the app can return to login. */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

/** Merge the Authorization header into a fetch init, preserving any others. */
function authed(init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers as HeadersInit | undefined);
  if (sessionToken) headers.set('Authorization', `Bearer ${sessionToken}`);
  return { ...init, headers };
}

/**
 * Throw on a failed response. A 401 means the token is missing, expired or
 * revoked: the session is cleared so the app shows the login screen instead of
 * a misleading "failed to fetch patients".
 */
async function ensureOk(res: Response, fallback: string): Promise<Response> {
  if (res.ok) return res;
  if (res.status === 401) {
    onUnauthorized?.();
    throw new Error(i18n.t('errors.sessionExpired'));
  }
  throw new Error(await errorMessage(res, fallback));
}

/** Same 401 handling for the upload paths, which report a bare status code. */
function ensureUploadOk(status: number | undefined, body: string | undefined, fallback: string): void {
  if (status && status >= 200 && status < 300) return;
  if (status === 401) {
    onUnauthorized?.();
    throw new Error(i18n.t('errors.sessionExpired'));
  }
  let msg = fallback;
  try {
    msg = JSON.parse(body || '')?.error || fallback;
  } catch {
    // response had no JSON body
  }
  throw new Error(msg);
}

// Filename extension → a MIME type Sarvam's STT accepts. Used when the OS file
// picker gives us nothing usable, which is common on Android.
const EXT_MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.mpeg': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.mp4': 'audio/mp4',
  '.aac': 'audio/aac',
  '.webm': 'audio/webm',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/opus',
  '.flac': 'audio/flac',
  '.3gp': 'audio/3gpp',
  '.amr': 'audio/amr',
};

/**
 * Resolve the MIME type to declare for an audio upload.
 *
 * The declared type matters: the backend forwards it to Sarvam, which validates
 * it against an allow-list and rejects the request outright on a mismatch —
 * it does not sniff the bytes.
 *
 * Two things have to be normalised:
 *   • `audio/m4a` — what Android/iOS report for recordings, but Sarvam only
 *     accepts the same container as `audio/mp4` / `audio/x-m4a`.
 *   • A missing or wildcard type. `DocumentPicker` frequently returns no
 *     `mimeType` on Android, and the caller's `a.mimeType || 'audio/*'` fallback
 *     then sent the literal string "audio/*", which is not a MIME type at all.
 *     The extension is a far better signal than a wildcard.
 */
function sttMimeType(type?: string, fileName?: string): string {
  const t = (type || '').toLowerCase().trim();
  if (t === 'audio/m4a' || t === 'audio/x-m4a') return 'audio/mp4';
  // A concrete audio/<subtype> from the picker is trustworthy.
  if (t.startsWith('audio/') && !t.includes('*')) return t;

  const name = (fileName || '').toLowerCase();
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot) : '';
  const fromExt = EXT_MIME[ext];
  if (fromExt) return fromExt;

  // Nothing conclusive. `application/octet-stream` is guaranteed to be rejected,
  // so declare the most common consultation format and let the server's own
  // validation have the final say.
  console.warn('[audio] could not determine MIME type', { type, fileName, ext });
  return 'audio/mpeg';
}

// Extract a server-provided error message ({ error: "..." }) when available,
// falling back to a sensible default. (Identical to the web client.)
async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    if (data?.error) return data.error as string;
  } catch {
    // response had no JSON body
  }
  return fallback;
}

// fetch with an abort-based timeout. Network-level failures surface in RN as a
// bare TypeError; we translate those into a clear, actionable message.
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error(i18n.t('errors.timeout'));
    }
    throw new Error(i18n.t('errors.network'));
  } finally {
    clearTimeout(timer);
  }
}

// Read a file's size on disk (bytes). 0 if missing/unknown. Used to log and to
// guard against empty/silent recordings before they reach Whisper.
async function fileSize(uri: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && 'size' in info ? (info.size as number) : 0;
  } catch {
    return 0;
  }
}

// Transcribe a recorded/selected audio file via the existing Whisper endpoint.
//
// IMPORTANT: we stream the file straight off disk with expo-file-system's
// MULTIPART uploader instead of React Native's FormData({uri}). RN's FormData
// file upload can corrupt/garble the binary on device, which made Whisper hear
// noise and hallucinate repeated words ("apar apar…"). uploadAsync sends the
// exact bytes, so mobile now matches the web upload. Same endpoint, same field
// name ("audio"), same form fields, same response shape.
/**
 * What POST /transcribe returns. `transcript`/`rawText` are the CORRECTED text
 * the app displays and builds the report from; `originalTranscript` is exactly
 * what the speech model heard, before clinical terminology normalisation, and
 * `terminology` records what changed. The last two are optional so an older
 * backend that predates the terminology engine keeps working unchanged.
 */
export interface TranscriptionResponse {
  transcript: string;
  rawText: string;
  audioUrl: string;
  originalTranscript?: string;
  terminology?: {
    corrections: TerminologyCorrection[];
    suggestions: TerminologyCorrection[];
    stats: { candidates: number; applied: number; suggested: number; ms: number };
  };
}

export async function transcribeAudio(
  file: RNAudioFile,
  language?: string,
): Promise<TranscriptionResponse> {
  const size = await fileSize(file.uri);
  if (size > 0 && size < 2000) {
    throw new Error('Recording too short or no audio captured. Please record again closer to the mic.');
  }

  const res = await FileSystem.uploadAsync(`${DOCTOR}/transcribe`, file.uri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    fieldName: 'audio',
    mimeType: sttMimeType(file.type, file.name),
    parameters: { language: language || 'Auto Detect' },
    // uploadAsync builds its own request, so the token goes on by hand here.
    headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {},
  });
  ensureUploadOk(res.status, res.body, 'Transcription failed');
  return JSON.parse(res.body);
}

// Resolve a server-relative media path (e.g. "/api/uploads/x.mp3") into a URL
// the player can load. Stored relative paths are prefixed with API_ROOT.
export function resolveMediaUrl(audioPath: string): string {
  if (!audioPath) return '';
  if (/^https?:\/\//i.test(audioPath)) return audioPath;
  // Recordings are authenticated and ownership-checked server-side. expo-audio
  // loads the URL itself and can't attach an Authorization header, so the token
  // rides along as `?t=` — the one place the server accepts it that way.
  const sep = audioPath.includes('?') ? '&' : '?';
  const auth = sessionToken ? `${sep}t=${encodeURIComponent(sessionToken)}` : '';
  return `${API_ROOT}${audioPath}${auth}`;
}

// Upload an audio file to the active session, transcribe it via the existing
// Whisper endpoint, and persist the audio (persist=true). Streams the file off
// disk with createUploadTask (binary-safe) and reports real upload progress.
// Same request shape as the web app.
export async function uploadConsultationAudio(
  file: RNAudioFile,
  options: {
    consultationId: string;
    language?: string;
    onProgress?: (percent: number) => void;
  },
): Promise<TranscriptionResponse> {
  const size = await fileSize(file.uri);
  if (size > 0 && size < 2000) {
    throw new Error('Audio file is empty or too short.');
  }

  const task = FileSystem.createUploadTask(
    `${DOCTOR}/transcribe`,
    file.uri,
    {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'audio',
      mimeType: sttMimeType(file.type, file.name),
      parameters: {
        language: options.language || 'Auto Detect',
        consultationId: options.consultationId,
        persist: 'true',
      },
      // createUploadTask builds its own request, so the token goes on by hand.
      headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {},
    },
    (data) => {
      if (options.onProgress && data.totalBytesExpectedToSend > 0) {
        options.onProgress(Math.round((data.totalBytesSent / data.totalBytesExpectedToSend) * 100));
      }
    },
  );

  let res;
  try {
    res = await task.uploadAsync();
  } catch (err) {
    console.error('[upload] network error', err);
    throw new Error(i18n.t('errors.network'));
  }
  ensureUploadOk(res?.status, res?.body, 'Transcription failed');
  return JSON.parse(res!.body);
}

// Best-effort delete of a persisted upload file from server storage. Never
// throws — identical behaviour to the web client.
export async function deleteConsultationAudio(audioUrl: string): Promise<void> {
  try {
    if (!audioUrl) return;
    const fileName = audioUrl.split('/').pop();
    if (!fileName) return;
    await fetch(`${DOCTOR}/uploads/${encodeURIComponent(fileName)}`, authed({ method: 'DELETE' }));
  } catch {
    // Storage deletion is best-effort; ignore failures.
  }
}

// ── Clinical terminology normalisation ───────────────────────
/** One automatic correction the terminology engine made or proposed. */
// Re-exported from types.ts, which owns the shape — callers can keep importing
// it from the API layer alongside the function that returns it.
export type { TerminologyCorrection } from '../types';

export interface TerminologyResult {
  originalTranscript: string;
  correctedTranscript: string;
  corrections: TerminologyCorrection[];
  suggestions: TerminologyCorrection[];
  stats: { candidates: number; applied: number; suggested: number; ms: number };
}

/**
 * Normalise medical terminology in a transcript the app already holds.
 *
 * Only the LIVE recording path needs this: on-device speech recognition never
 * reaches the server, so this is the transcript's one chance to be checked
 * against the full terminology index. Uploaded audio is corrected inside
 * /transcribe, and report generation corrects again as a backstop.
 *
 * Never throws. A failure here means the doctor keeps the uncorrected text,
 * which is strictly better than losing the recording to an error dialog.
 */
export async function correctTranscriptTerminology(
  transcript: string,
): Promise<TerminologyResult | null> {
  try {
    const res = await fetchWithTimeout(
      `${DOCTOR}/correct-transcript`,
      authed({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript }),
      }),
      30000,
    );
    if (!res.ok) {
      console.warn('[terminology] correction unavailable —', res.status);
      return null;
    }
    const data = (await res.json()) as TerminologyResult;
    return data;
  } catch (err) {
    console.warn('[terminology] correction failed, keeping original transcript', err);
    return null;
  }
}

export async function translateTranscript(
  text: string,
  targetLanguage: string,
): Promise<string> {
  const res = await fetchWithTimeout(
    `${DOCTOR}/translate-transcript`,
    authed({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, targetLanguage }),
    }),
    120000,
  );
  await ensureOk(res, 'Translation failed');
  const data = await res.json();
  return data.translatedText as string;
}

/**
 * Generate the clinical report. `language` is the doctor's app UI language —
 * pass 'hi' to have the report written in Hindi (drug and lab names stay Latin);
 * anything else produces an English report.
 */
export async function generateReport(transcript: string, language = 'en'): Promise<ReportData> {
  const res = await fetchWithTimeout(
    `${DOCTOR}/generate-report`,
    authed({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript, language }),
    }),
    // Sarvam's per-call latency is extremely variable: a measured end-to-end run
    // took 247s, with 223s of that spent waiting on the slowest of three
    // parallel calls. This endpoint sends nothing until the whole report is
    // built, so the timeout has to cover the worst case or it cuts off work that
    // was about to succeed.
    300000,
  );
  await ensureOk(res, 'Report generation failed');
  return res.json();
}

/**
 * One pipeline stage finishing, server-side. `stage` is a stable key the caller
 * translates; see the app's `report.stage.*` strings.
 */
export interface ReportProgressEvent {
  stage: string;
  completed: number;
  total: number;
  /**
   * The stage gave up and contributed nothing, so its sections are MISSING from
   * the report rather than genuinely empty. The doctor has to be told: a report
   * that quietly drops its prescription reads exactly like a consultation where
   * no medicine was given.
   */
  failed?: boolean;
}

/**
 * Generate the report, reporting each stage as the server finishes it.
 *
 * Same result as generateReport — this exists because generation takes 45-60s,
 * which over a plain request is indistinguishable from the app having hung.
 *
 * Uses `expo/fetch` rather than the global fetch: React Native's built-in fetch
 * buffers the entire body before resolving, so `response.body` is not a readable
 * stream there and every progress event would arrive at once, after the work was
 * already done. expo/fetch is WinterCG-compliant and streams on both platforms.
 *
 * Falls back to the non-streaming endpoint if streaming is unavailable for any
 * reason, so a doctor never loses the ability to produce a report just because
 * progress could not be shown.
 */
export async function generateReportStreaming(
  transcript: string,
  language = 'en',
  onProgress?: (event: ReportProgressEvent) => void,
): Promise<ReportData> {
  try {
    return await streamReport(transcript, language, onProgress);
  } catch (err: any) {
    // A failure the server explicitly reported (bad key, quota, Sarvam error) is
    // the real answer and must reach the doctor. Only a transport-level problem
    // means "streaming did not work here", and only that is worth retrying.
    if (err?.reported) throw err;
    console.warn('[generateReport] streaming unavailable, falling back:', err?.message || err);
    return generateReport(transcript, language);
  }
}

async function streamReport(
  transcript: string,
  language: string,
  onProgress?: (event: ReportProgressEvent) => void,
): Promise<ReportData> {
  const { fetch: streamingFetch } = await import('expo/fetch');

  const controller = new AbortController();
  // Refreshed by every chunk: the cap is on SILENCE, not on total duration.
  // Generation legitimately runs for minutes — a measured run went 180s between
  // two consecutive stages — so this would be far too aggressive on its own. It
  // works because the server sends an SSE keepalive comment every 15s, which
  // arrives as a chunk and resets this. Silence for 90s therefore means the
  // connection is genuinely dead, not that the model is slow.
  let timer: ReturnType<typeof setTimeout> | null = null;
  const resetIdleTimeout = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => controller.abort(), 90000);
  };
  resetIdleTimeout();

  try {
    const res = await streamingFetch(`${DOCTOR}/generate-report/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      },
      body: JSON.stringify({ transcript, language }),
      signal: controller.signal,
    });

    if (res.status === 401) {
      onUnauthorized?.();
      const err: any = new Error(i18n.t('errors.sessionExpired'));
      err.reported = true;
      throw err;
    }
    // A 404 means this backend predates the streaming route — that is exactly
    // the case the caller's fallback exists for, so leave it unreported.
    if (!res.ok) throw new Error(`Report stream failed with ${res.status}`);
    if (!res.body) throw new Error('Report stream returned no readable body');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let report: ReportData | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      resetIdleTimeout();
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line. Anything after the last
      // separator is a partial frame and stays buffered for the next chunk.
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        const parsed = parseSseFrame(frame);
        if (!parsed) continue;
        const { event, data } = parsed;
        if (event === 'progress') {
          onProgress?.(data as ReportProgressEvent);
        } else if (event === 'done') {
          report = data as ReportData;
        } else if (event === 'error') {
          const err: any = new Error(data?.error || 'Report generation failed');
          err.reported = true;
          throw err;
        }
      }
    }

    // The stream ended without a `done` event: the socket dropped partway. Treat
    // it as a transport failure so the caller retries on the plain endpoint,
    // rather than handing back a half-built report.
    if (!report) throw new Error('Report stream ended before the report arrived');
    return report;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Pull the event name and JSON payload out of one SSE frame. */
function parseSseFrame(frame: string): { event: string; data: any } | null {
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    // Per the SSE format a multi-line payload arrives as repeated data: lines.
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
  }
  if (!dataLines.length) return null;
  try {
    return { event, data: JSON.parse(dataLines.join('\n')) };
  } catch {
    return null;
  }
}

/** Dashboard summary for a date range, computed server-side. */
export interface DoctorAnalytics {
  startDate: string | null;
  endDate: string | null;
  days: number;
  totalConsultations: number;
  completedReports: number;
  draftReports: number;
  pendingFollowUps: number;
  completionRate: number;
  averagePerDay: number;
}

/**
 * Consultations within a date range.
 *
 * The range is applied in the database, so a screen showing one week never
 * downloads years of history to filter it away. Omitting the query returns
 * everything, which is what AppDataProvider still does for the app-wide cache.
 */
export async function fetchConsultationsInRange(query: string): Promise<Consultation[]> {
  const res = await fetchWithTimeout(
    `${DOCTOR}/consultations${query ? `?${query}` : ''}`,
    authed({ method: 'GET' }),
    30000,
  );
  await ensureOk(res, 'Failed to load consultations');
  return res.json();
}

/**
 * The six dashboard summary figures for a date range.
 *
 * Counted in the database rather than derived from a downloaded list — the
 * answer is six numbers, and the client should not need every record to get it.
 */
export async function fetchAnalytics(query: string): Promise<DoctorAnalytics> {
  const res = await fetchWithTimeout(
    `${DOCTOR}/analytics${query ? `?${query}` : ''}`,
    authed({ method: 'GET' }),
    30000,
  );
  await ensureOk(res, 'Failed to load analytics');
  return res.json();
}

// ── Analytics assistant ───────────────────────────────────────

export interface ChatMetric {
  id: string;
  label: string;
  value: number | string | null;
  unit?: string;
  coverage?: { have: number; total: number };
  series?: { name: string; value: number }[];
  rows?: Record<string, unknown>[];
  unavailable?: boolean;
  note?: string;
}

export interface ChatAnswer {
  answer: string;
  range: { label: string; displayLabel?: string; start: string; end: string; days: number };
  metrics: ChatMetric[];
  suggestions: string[];
  /** Whether the client should render charts — only when a visual was asked for. */
  visualize?: boolean;
  degraded?: boolean;
}

/**
 * Ask the assistant a question about this doctor's own data.
 *
 * `history` is the recent conversation, so a follow-up like "and last month?"
 * resolves. The server caps and sanitises it — only role and content are sent.
 */
export async function askAssistant(
  question: string,
  history: { role: 'user' | 'assistant'; content: string }[] = [],
): Promise<ChatAnswer> {
  const res = await fetchWithTimeout(
    `${DOCTOR}/chat`,
    authed({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, history: history.slice(-6) }),
    }),
    // The model reasons before answering AND the free-tier server can be cold,
    // so this is much slower than a data call — allow for a wake-up plus a
    // reasoning pass rather than timing out on the first question of the day.
    120000,
  );
  await ensureOk(res, 'Could not answer that question');
  return res.json();
}

/**
 * Record that something happened, for the analytics the assistant reports on.
 *
 * Fire-and-forget by design: telemetry must never interrupt or fail the action
 * that produced it. A doctor exporting a PDF should not see an error because a
 * usage event could not be written.
 */
export function trackEvent(
  type: 'report_downloaded' | 'report_shared' | 'recording_failed' | 'transcription_failed',
  detail: { consultationId?: string; detail?: string } = {},
): void {
  void fetchWithTimeout(
    `${DOCTOR}/events`,
    authed({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, ...detail }),
    }),
    10000,
  ).catch(() => {
    /* never surfaced */
  });
}

export async function saveConsultation(consultation: Consultation): Promise<void> {
  const res = await fetch(`${DOCTOR}/save-consultation`, authed({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(consultation),
  }));
  await ensureOk(res, 'Failed to save consultation');
}

export async function getPatients(): Promise<Patient[]> {
  const res = await fetch(`${DOCTOR}/patients`, authed());
  await ensureOk(res, 'Failed to fetch patients');
  return res.json();
}

export async function getConsultations(): Promise<Consultation[]> {
  const res = await fetch(`${DOCTOR}/consultations`, authed());
  await ensureOk(res, 'Failed to fetch consultations');
  return res.json();
}

/**
 * Permanently delete a consultation and everything derived from it.
 *
 * The server removes the report, prescription, transcript and stored audio that
 * share its id, so nothing is orphaned. Ownership is enforced there — this can
 * only ever delete the signed-in doctor's own session.
 */
export async function deleteConsultation(id: string): Promise<void> {
  const res = await fetchWithTimeout(
    `${DOCTOR}/consultations/${encodeURIComponent(id)}`,
    authed({ method: 'DELETE' }),
    30000,
  );
  await ensureOk(res, 'Could not delete the consultation');
}

export async function savePatient(patient: Patient): Promise<void> {
  const res = await fetch(`${DOCTOR}/patients`, authed({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patient),
  }));
  await ensureOk(res, 'Failed to save patient');
}

// ── Reports ──────────────────────────────────────────────────
export async function getReports(): Promise<ReportRecord[]> {
  const res = await fetch(`${DOCTOR}/reports`, authed());
  await ensureOk(res, 'Failed to fetch reports');
  return res.json();
}

export async function saveReport(report: ReportRecord): Promise<void> {
  const res = await fetch(`${DOCTOR}/reports`, authed({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
  }));
  await ensureOk(res, 'Failed to save report');
}

// ── Prescriptions ────────────────────────────────────────────
export async function getPrescriptions(): Promise<PrescriptionRecord[]> {
  const res = await fetch(`${DOCTOR}/prescriptions`, authed());
  await ensureOk(res, 'Failed to fetch prescriptions');
  return res.json();
}

export async function savePrescription(prescription: PrescriptionRecord): Promise<void> {
  const res = await fetch(`${DOCTOR}/prescriptions`, authed({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prescription),
  }));
  await ensureOk(res, 'Failed to save prescription');
}

// ── Dashboard stats (counts from MongoDB) ────────────────────
export interface DashboardStats {
  patients: number;
  consultations: number;
  reports: number;
  prescriptions: number;
  transcripts: number;
}

export async function getStats(): Promise<DashboardStats> {
  const res = await fetch(`${DOCTOR}/stats`, authed());
  await ensureOk(res, 'Failed to fetch stats');
  return res.json();
}

// ── Transcripts ──────────────────────────────────────────────
export async function getTranscripts(): Promise<TranscriptRecord[]> {
  const res = await fetch(`${DOCTOR}/transcripts`, authed());
  await ensureOk(res, 'Failed to fetch transcripts');
  return res.json();
}

export async function saveTranscript(transcript: TranscriptRecord): Promise<void> {
  const res = await fetch(`${DOCTOR}/transcripts`, authed({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(transcript),
  }));
  await ensureOk(res, 'Failed to save transcript');
}

// Build the auth header for a Bearer token. Spread into a fetch `headers`.
// The data routes take their token from the ambient session via authed(); this
// is for the auth endpoints, which are handed an explicit token instead.
function authHeaders(token?: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Auth (public) ────────────────────────────────────────────
export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await fetchWithTimeout(
    `${BASE}/auth/login`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    },
    30000,
  );
  if (!res.ok) throw new Error(await errorMessage(res, 'Login failed. Check your credentials.'));
  return res.json();
}

// Optional doctor profile captured by the sign-up form. The server stores what
// it is given and defaults the rest, so every field here is genuinely optional.
export interface RegisterProfile {
  phone?: string;
  specialization?: string;
  licenseNumber?: string;
  hospital?: string;
  city?: string;
  state?: string;
}

// Self-service doctor signup. The new account always starts EMPTY: the server
// assigns role 'doctor' (never taken from this payload) and every data query is
// filtered by the new doctorId, so no existing records are visible to it.
export async function register(
  name: string,
  email: string,
  password: string,
  profile: RegisterProfile = {},
): Promise<AuthResponse> {
  const res = await fetchWithTimeout(
    `${BASE}/auth/register`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, ...profile }),
    },
    30000,
  );
  if (!res.ok) throw new Error(await errorMessage(res, 'Registration failed'));
  return res.json();
}

// ── Password reset ────────────────────────────────────────────
// Two-step: request a 6-digit code by email, then exchange it for a new
// password. The server answers `forgotPassword` identically whether or not the
// address has an account, so this can never be used to discover who is
// registered — don't "improve" the messaging to distinguish the two cases.
//
// NOTE: delivery needs RESEND_API_KEY on the server. Without it the code is
// only written to the server log, so no doctor can complete a reset.
export async function forgotPassword(email: string): Promise<{ message: string }> {
  const res = await fetchWithTimeout(
    `${BASE}/auth/forgot-password`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    },
    30000,
  );
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not send the reset code'));
  return res.json();
}

export async function resetPassword(
  email: string,
  code: string,
  password: string,
): Promise<AuthResponse> {
  const res = await fetchWithTimeout(
    `${BASE}/auth/reset-password`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code, password }),
    },
    30000,
  );
  if (!res.ok) throw new Error(await errorMessage(res, 'Password reset failed'));
  return res.json();
}

export async function getMe(token: string): Promise<AuthUser> {
  const res = await fetchWithTimeout(
    `${BASE}/auth/me`,
    { method: 'GET', headers: { ...authHeaders(token) } },
    30000,
  );
  if (!res.ok) throw new Error(await errorMessage(res, 'Session expired'));
  const data = await res.json();
  return (data?.user ?? data) as AuthUser;
}

/**
 * Save the signed-in doctor's own profile.
 *
 * Only the fields passed are changed; the server ignores everything outside its
 * own whitelist, so this can never alter role or status. Returns the stored
 * record, which is what the app should then trust — not the values it sent.
 */
export async function updateMyProfile(patch: {
  name?: string;
  specialization?: string;
  licenseNumber?: string;
  hospital?: string;
  phone?: string;
  city?: string;
  state?: string;
}): Promise<AuthUser> {
  const res = await fetchWithTimeout(
    `${BASE}/auth/me`,
    authed({
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
    30000,
  );
  await ensureOk(res, 'Could not save your profile');
  const data = await res.json();
  return (data?.user ?? data) as AuthUser;
}
