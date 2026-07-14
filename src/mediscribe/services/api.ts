import {
  ReportData,
  Patient,
  Consultation,
  ReportRecord,
  PrescriptionRecord,
  TranscriptRecord,
  ConsultationHistoryItem,
  UpcomingAppointment,
} from '../types';
import {
  AuthUser,
  AuthResponse,
  AdminOverview,
  AdminAnalytics,
  LanguageUsageRow,
  AdminSettings,
  AdminNotification,
  GlobalSearchResponse,
  Role,
  ConsultationBucket,
} from '../contracts';

// In production the frontend (Vercel) and backend (Render) are on different
// origins, so point at the backend via VITE_API_BASE_URL. In local dev it is
// empty and requests use the Vite dev proxy (`/api` → localhost:5000).
const API_ROOT = ((import.meta.env.VITE_API_URL as string) || (import.meta.env.VITE_API_BASE_URL as string) || '').replace(/\/+$/, '');
const BASE = `${API_ROOT}/api/mediscribe`;

// The logged-in clinic's JWT, shared with the rest of ClinicBook (SSO).
function authHeader(): Record<string, string> {
  const token = localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Render report/transcript HTML to a real (selectable-text) PDF via the backend's
// headless-Chrome renderer. Same HTML the client prints → identical layout.
export async function renderReportPdf(html: string, filename: string): Promise<Blob> {
  const res = await fetch(`${BASE}/render-pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ html, filename }),
  });
  if (!res.ok) throw new Error('Failed to generate PDF');
  return res.blob();
}

// Extract a server-provided error message ({ error: "..." }) when available,
// falling back to a sensible default.
async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    if (data?.error) return data.error as string;
  } catch {
    // response had no JSON body
  }
  return fallback;
}

// fetch with an abort-based timeout. Network-level failures (backend down, dropped
// socket, DNS/CORS) surface in the browser as a bare TypeError "Failed to fetch";
// we translate those into a clear, actionable message instead.
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
      throw new Error('The request timed out. Please check your connection and try again.');
    }
    throw new Error(
      'Could not reach the server. Make sure the backend is running (npm run dev:all), then try again.',
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function transcribeAudio(
  blob: Blob,
  language?: string
): Promise<{ transcript: string; rawText: string; audioUrl: string }> {
  const form = new FormData();
  form.append('audio', blob, 'consultation.webm');
  // Forward the selected language; the server treats "Auto Detect" as auto-detect.
  // Do NOT set Content-Type — the browser sets the multipart boundary automatically.
  form.append('language', language || 'Auto Detect');
  // Transcription can take a while — allow up to 3 minutes before giving up.
  const res = await fetchWithTimeout(`${BASE}/transcribe`, { method: 'POST', body: form, headers: authHeader() }, 180000);
  if (!res.ok) {
    // Log the REAL backend reason (not a generic message) so failures are debuggable.
    const message = await errorMessage(res, 'Transcription failed');
    console.error('Transcription failed:', message);
    throw new Error(message);
  }
  return res.json();
}

// Resolve a server-relative media path (e.g. "/api/uploads/x.mp3") into a URL
// the browser can load. In production the backend lives on a different origin
// (API_ROOT), so the stored relative path must be prefixed; in dev the Vite
// proxy makes the relative path work as-is.
export function resolveMediaUrl(audioPath: string): string {
  if (!audioPath) return '';
  if (/^https?:\/\//i.test(audioPath)) return audioPath;
  return `${API_ROOT}${audioPath}`;
}

// Upload an audio file to the active session, transcribe it via the existing
// Whisper endpoint, and persist the audio so it survives a refresh. Uses
// XMLHttpRequest (not fetch) so we can report real upload progress.
export function uploadConsultationAudio(
  file: File,
  options: {
    consultationId: string;
    language?: string;
    onProgress?: (percent: number) => void;
  },
): Promise<{ transcript: string; rawText: string; audioUrl: string }> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('audio', file, file.name);
    form.append('language', options.language || 'Auto Detect');
    form.append('consultationId', options.consultationId);
    // Tell the server to keep the file on disk and return a real audioUrl.
    form.append('persist', 'true');

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}/transcribe`);
    // Attach the shared ClinicBook JWT — this endpoint is auth-gated. (Without it
    // the server rejects with 401 before reading the body, which surfaces in the
    // browser as net::ERR_HTTP2_PROTOCOL_ERROR.) Do NOT set Content-Type; the
    // browser sets the multipart boundary for the FormData body automatically.
    const token = localStorage.getItem('auth_token');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    // STT can take a while — match the fetch-based timeout (3 minutes).
    xhr.timeout = 180000;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && options.onProgress) {
        options.onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      let data: any = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // non-JSON response
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
      } else {
        // Log the REAL backend reason so an upload failure is debuggable.
        const message = data?.error || xhr.responseText || 'Transcription failed';
        console.error('Transcription failed:', message);
        reject(new Error(message));
      }
    };
    xhr.onerror = () =>
      reject(
        new Error(
          'Could not reach the server. Make sure the backend is running (npm run dev:all), then try again.',
        ),
      );
    xhr.ontimeout = () =>
      reject(new Error('The upload timed out. Please check your connection and try again.'));

    xhr.send(form);
  });
}

// Best-effort delete of a persisted upload file from server storage. Takes the
// stored audioUrl (e.g. "/api/uploads/abc.mp3"). Never throws — if storage
// deletion fails the caller still clears the session's audio reference.
export async function deleteConsultationAudio(audioUrl: string): Promise<void> {
  try {
    if (!audioUrl) return;
    const fileName = audioUrl.split('/').pop();
    if (!fileName) return;
    await fetch(`${BASE}/uploads/${encodeURIComponent(fileName)}`, { method: 'DELETE', headers: authHeader() });
  } catch {
    // Storage deletion is best-effort; ignore failures.
  }
}

export async function translateTranscript(
  text: string,
  targetLanguage: string
): Promise<string> {
  const res = await fetchWithTimeout(
    `${BASE}/translate-transcript`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ text, targetLanguage }),
    },
    120000,
  );
  if (!res.ok) {
    // Log the REAL backend reason so translation failures are debuggable.
    const message = await errorMessage(res, 'Translation failed');
    console.error('Translation failed:', message);
    throw new Error(message);
  }
  const data = await res.json();
  return data.translatedText as string;
}

export async function generateReport(transcript: string): Promise<ReportData> {
  const res = await fetchWithTimeout(
    `${BASE}/generate-report`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ transcript }),
    },
    180000,
  );
  if (!res.ok) throw new Error(await errorMessage(res, 'Report generation failed'));
  return res.json();
}

export async function saveConsultation(consultation: Consultation): Promise<void> {
  const res = await fetch(`${BASE}/save-consultation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(consultation),
  });
  if (!res.ok) throw new Error('Failed to save consultation');
}

// The clinic's still-upcoming appointments (from ClinicBook) — shown on the
// dashboard so the doctor can start a scribe session for a booked visit.
export async function getUpcomingAppointments(): Promise<UpcomingAppointment[]> {
  try {
    const res = await fetch(`${BASE}/appointments/upcoming`, { cache: 'no-store', headers: authHeader() });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function getPatients(): Promise<Patient[]> {
  const res = await fetch(`${BASE}/patients`, { cache: 'no-store', headers: authHeader() });
  if (!res.ok) throw new Error('Failed to fetch patients');
  return res.json();
}

export async function getConsultations(): Promise<Consultation[]> {
  const res = await fetch(`${BASE}/consultations`, { cache: 'no-store', headers: authHeader() });
  if (!res.ok) throw new Error('Failed to fetch consultations');
  return res.json();
}

// Fetch a single patient's previous consultation history (grouped, read-only).
// Defaults to oldest → newest; pass order='desc' to reverse.
export async function getPatientHistory(
  patientId: string,
  order: 'asc' | 'desc' = 'asc',
): Promise<ConsultationHistoryItem[]> {
  const res = await fetch(
    `${BASE}/patients/${encodeURIComponent(patientId)}/history?order=${order}`,
    { cache: 'no-store', headers: authHeader() },
  );
  if (!res.ok) throw new Error(await errorMessage(res, 'Failed to fetch consultation history'));
  return res.json();
}

// Creates a REAL ClinicBook patient (shared across the clinic) and returns it
// with the ClinicBook id, so the caller can link the consultation to it.
export async function savePatient(patient: Patient): Promise<Patient> {
  const res = await fetch(`${BASE}/patients`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(patient),
  });
  if (!res.ok) throw new Error('Failed to save patient');
  const data = await res.json().catch(() => ({}));
  return (data?.patient as Patient) ?? patient;
}

// ── Reports ──────────────────────────────────────────────────
export async function getReports(): Promise<ReportRecord[]> {
  const res = await fetch(`${BASE}/reports`, { cache: 'no-store', headers: authHeader() });
  if (!res.ok) throw new Error('Failed to fetch reports');
  return res.json();
}

export async function saveReport(report: ReportRecord): Promise<void> {
  const res = await fetch(`${BASE}/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(report),
  });
  if (!res.ok) throw new Error('Failed to save report');
}

// ── Prescriptions ────────────────────────────────────────────
export async function getPrescriptions(): Promise<PrescriptionRecord[]> {
  const res = await fetch(`${BASE}/prescriptions`, { cache: 'no-store', headers: authHeader() });
  if (!res.ok) throw new Error('Failed to fetch prescriptions');
  return res.json();
}

export async function savePrescription(prescription: PrescriptionRecord): Promise<void> {
  const res = await fetch(`${BASE}/prescriptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(prescription),
  });
  if (!res.ok) throw new Error('Failed to save prescription');
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
  const res = await fetch(`${BASE}/stats`, { cache: 'no-store', headers: authHeader() });
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}

// ── Transcripts ──────────────────────────────────────────────
export async function getTranscripts(): Promise<TranscriptRecord[]> {
  const res = await fetch(`${BASE}/transcripts`, { cache: 'no-store', headers: authHeader() });
  if (!res.ok) throw new Error('Failed to fetch transcripts');
  return res.json();
}

export async function saveTranscript(transcript: TranscriptRecord): Promise<void> {
  const res = await fetch(`${BASE}/transcripts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(transcript),
  });
  if (!res.ok) throw new Error('Failed to save transcript');
}
// ══════════════════════════════════════════════════════════════
// Admin Dashboard API
// ──────────────────────────────────────────────────────────────
// Every admin endpoint requires a Bearer token. `authHeaders(token)` builds the
// standard JSON + Authorization header pair; each function throws on !res.ok
// with the server-provided error message so the UI can surface it verbatim.
// ══════════════════════════════════════════════════════════════

export function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// A consultation record as returned by the admin endpoints — the raw persisted
// document, which carries a few more fields than the client-facing Consultation.
export interface AdminConsultation extends Consultation {
  doctorId?: string;
  doctorName?: string;
  language?: string;
  durationMs?: number;
  transcriptText?: string;
  originalTranscript?: string;
}

async function jsonOrThrow<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) throw new Error(await errorMessage(res, fallback));
  return res.json() as Promise<T>;
}

const ADMIN = `${BASE}/admin`;

// ── Auth ─────────────────────────────────────────────────────
export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ email, password }),
  });
  return jsonOrThrow<AuthResponse>(res, 'Login failed');
}

export async function register(name: string, email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ name, email, password }),
  });
  return jsonOrThrow<AuthResponse>(res, 'Registration failed');
}

export async function getMe(token: string): Promise<AuthUser> {
  const res = await fetch(`${BASE}/auth/me`, { headers: authHeaders(token) });
  const data = await jsonOrThrow<{ user: AuthUser }>(res, 'Failed to load profile');
  return data.user;
}

// ── Overview / Analytics / Languages ─────────────────────────
export async function getOverview(token: string): Promise<AdminOverview> {
  const res = await fetch(`${ADMIN}/overview`, { headers: authHeaders(token), cache: 'no-store' });
  return jsonOrThrow<AdminOverview>(res, 'Failed to load overview');
}

export async function getAnalytics(token: string): Promise<AdminAnalytics> {
  const res = await fetch(`${ADMIN}/analytics`, { headers: authHeaders(token), cache: 'no-store' });
  return jsonOrThrow<AdminAnalytics>(res, 'Failed to load analytics');
}

export async function getLanguages(token: string): Promise<LanguageUsageRow[]> {
  const res = await fetch(`${ADMIN}/languages`, { headers: authHeaders(token), cache: 'no-store' });
  return jsonOrThrow<LanguageUsageRow[]>(res, 'Failed to load languages');
}

// ── Doctor Management ────────────────────────────────────────
export interface DoctorInput {
  name?: string;
  email?: string;
  password?: string;
  specialization?: string;
  licenseNumber?: string;
  hospital?: string;
  experience?: number;
  phone?: string;
}

export async function getDoctors(token: string, search = ''): Promise<AuthUser[]> {
  const url = `${ADMIN}/doctors${search ? `?search=${encodeURIComponent(search)}` : ''}`;
  const res = await fetch(url, { headers: authHeaders(token), cache: 'no-store' });
  return jsonOrThrow<AuthUser[]>(res, 'Failed to load doctors');
}

export async function createDoctor(token: string, input: DoctorInput): Promise<AuthUser> {
  const res = await fetch(`${ADMIN}/doctors`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
  return jsonOrThrow<AuthUser>(res, 'Failed to create doctor');
}

export async function updateDoctor(token: string, id: string, input: DoctorInput): Promise<AuthUser> {
  const res = await fetch(`${ADMIN}/doctors/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
  return jsonOrThrow<AuthUser>(res, 'Failed to update doctor');
}

export async function deleteDoctor(token: string, id: string): Promise<void> {
  const res = await fetch(`${ADMIN}/doctors/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  await jsonOrThrow(res, 'Failed to delete doctor');
}

export async function suspendDoctor(token: string, id: string): Promise<void> {
  const res = await fetch(`${ADMIN}/doctors/${encodeURIComponent(id)}/suspend`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  await jsonOrThrow(res, 'Failed to suspend doctor');
}

export async function activateDoctor(token: string, id: string): Promise<void> {
  const res = await fetch(`${ADMIN}/doctors/${encodeURIComponent(id)}/activate`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  await jsonOrThrow(res, 'Failed to activate doctor');
}

// ── Users & Roles ────────────────────────────────────────────
export async function getUsers(token: string): Promise<AuthUser[]> {
  const res = await fetch(`${ADMIN}/users`, { headers: authHeaders(token), cache: 'no-store' });
  return jsonOrThrow<AuthUser[]>(res, 'Failed to load users');
}

export async function createUser(
  token: string,
  input: { name?: string; email: string; password?: string; role: Role },
): Promise<AuthUser> {
  const res = await fetch(`${ADMIN}/users`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
  return jsonOrThrow<AuthUser>(res, 'Failed to create user');
}

export async function updateUserRole(token: string, id: string, role: Role): Promise<void> {
  const res = await fetch(`${ADMIN}/users/${encodeURIComponent(id)}/role`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify({ role }),
  });
  await jsonOrThrow(res, 'Failed to update role');
}

// ── Patient Management ───────────────────────────────────────
export async function getAdminPatients(token: string, search = ''): Promise<Patient[]> {
  const url = `${ADMIN}/patients${search ? `?search=${encodeURIComponent(search)}` : ''}`;
  const res = await fetch(url, { headers: authHeaders(token), cache: 'no-store' });
  return jsonOrThrow<Patient[]>(res, 'Failed to load patients');
}

export async function deletePatient(token: string, id: string): Promise<void> {
  const res = await fetch(`${ADMIN}/patients/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  await jsonOrThrow(res, 'Failed to delete patient');
}

export async function getAdminPatientHistory(
  token: string,
  id: string,
  order: 'asc' | 'desc' = 'desc',
): Promise<ConsultationHistoryItem[]> {
  const res = await fetch(
    `${ADMIN}/patients/${encodeURIComponent(id)}/history?order=${order}`,
    { headers: authHeaders(token), cache: 'no-store' },
  );
  return jsonOrThrow<ConsultationHistoryItem[]>(res, 'Failed to load history');
}

// ── Consultation Management ──────────────────────────────────
export async function getAdminConsultations(
  token: string,
  bucket: ConsultationBucket,
  search = '',
): Promise<AdminConsultation[]> {
  const params = new URLSearchParams({ bucket });
  if (search) params.set('search', search);
  const res = await fetch(`${ADMIN}/consultations?${params.toString()}`, {
    headers: authHeaders(token),
    cache: 'no-store',
  });
  return jsonOrThrow<AdminConsultation[]>(res, 'Failed to load consultations');
}

export async function retryConsultation(token: string, id: string): Promise<{ status: string }> {
  const res = await fetch(`${ADMIN}/consultations/${encodeURIComponent(id)}/retry`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  return jsonOrThrow<{ status: string }>(res, 'Failed to retry consultation');
}

export async function deleteConsultation(token: string, id: string): Promise<void> {
  const res = await fetch(`${ADMIN}/consultations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  await jsonOrThrow(res, 'Failed to delete consultation');
}

// ── Reports Management ───────────────────────────────────────
export async function getAdminReports(token: string, search = ''): Promise<ReportRecord[]> {
  const url = `${ADMIN}/reports${search ? `?search=${encodeURIComponent(search)}` : ''}`;
  const res = await fetch(url, { headers: authHeaders(token), cache: 'no-store' });
  return jsonOrThrow<ReportRecord[]>(res, 'Failed to load reports');
}

export async function deleteReport(token: string, id: string): Promise<void> {
  const res = await fetch(`${ADMIN}/reports/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  await jsonOrThrow(res, 'Failed to delete report');
}

// ── Settings ─────────────────────────────────────────────────
export async function getSettings(token: string): Promise<AdminSettings> {
  const res = await fetch(`${ADMIN}/settings`, { headers: authHeaders(token), cache: 'no-store' });
  return jsonOrThrow<AdminSettings>(res, 'Failed to load settings');
}

export async function updateSettings(token: string, settings: AdminSettings): Promise<AdminSettings> {
  const res = await fetch(`${ADMIN}/settings`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify(settings),
  });
  return jsonOrThrow<AdminSettings>(res, 'Failed to save settings');
}

export async function triggerBackup(token: string): Promise<{ lastBackupAt: string }> {
  const res = await fetch(`${ADMIN}/backup`, { method: 'POST', headers: authHeaders(token) });
  return jsonOrThrow<{ lastBackupAt: string }>(res, 'Backup failed');
}

// ── Notifications ────────────────────────────────────────────
export async function getNotifications(token: string): Promise<AdminNotification[]> {
  const res = await fetch(`${ADMIN}/notifications`, { headers: authHeaders(token), cache: 'no-store' });
  return jsonOrThrow<AdminNotification[]>(res, 'Failed to load notifications');
}

export async function markNotificationRead(token: string, id: string): Promise<void> {
  const res = await fetch(`${ADMIN}/notifications/${encodeURIComponent(id)}/read`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  await jsonOrThrow(res, 'Failed to update notification');
}

export async function markAllNotificationsRead(token: string): Promise<void> {
  const res = await fetch(`${ADMIN}/notifications/read-all`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  await jsonOrThrow(res, 'Failed to update notifications');
}

// ── Global Search ────────────────────────────────────────────
export async function globalSearch(token: string, q: string): Promise<GlobalSearchResponse> {
  const res = await fetch(`${ADMIN}/search?q=${encodeURIComponent(q)}`, {
    headers: authHeaders(token),
    cache: 'no-store',
  });
  return jsonOrThrow<GlobalSearchResponse>(res, 'Search failed');
}
