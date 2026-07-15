import {
  ReportData,
  Patient,
  Consultation,
  ReportRecord,
  PrescriptionRecord,
  TranscriptRecord,
} from '../types';
import {
  AuthResponse,
  AuthUser,
  AdminOverview,
  AdminAnalytics,
  LanguageUsageRow,
  AdminSettings,
  AdminNotification,
  GlobalSearchResponse,
  Role,
  ConsultationBucket,
} from '../contracts';
import { API_ROOT, API_BASE as BASE, AUTH_BASE } from '../config';
import * as FileSystem from 'expo-file-system/legacy';

// The logged-in clinic's JWT (shared ClinicBook token). Set by the Auth context on
// login/hydrate and attached as a Bearer token to EVERY backend request — all
// /api/mediscribe routes are auth-gated.
let currentToken: string | null = null;
export function setAuthToken(token: string | null): void {
  currentToken = token;
}

// A picked/recorded audio file as React Native's FormData expects it. RN builds
// the multipart body from this { uri, name, type } descriptor (the web app sent
// a Blob/File; the backend contract is identical — field name "audio").
export interface RNAudioFile {
  uri: string;
  name: string;
  type: string;
}

// Sarvam's Speech-to-Text accepts the MP4/AAC container under `audio/mp4` and
// `audio/x-m4a`, but NOT the equivalent string `audio/m4a` that Android/iOS
// report for recordings — sending `audio/m4a` makes the backend's Sarvam call
// fail with `Invalid file type: audio/m4a`. Map that one synonym to the accepted
// `audio/mp4` (identical bytes/container); everything else is passed through.
function sttMimeType(type?: string): string {
  const t = (type || '').toLowerCase();
  if (t === 'audio/m4a' || t === 'audio/x-m4a') return 'audio/mp4';
  return type || 'application/octet-stream';
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
      throw new Error('The request timed out. Please check your connection and try again.');
    }
    throw new Error(
      'Could not reach the server. Check your internet connection and that the backend URL is configured, then try again.',
    );
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
export async function transcribeAudio(
  file: RNAudioFile,
  language?: string,
): Promise<{ transcript: string; rawText: string; audioUrl: string }> {
  const size = await fileSize(file.uri);
  console.log('[transcribe] uploading', {
    uri: file.uri,
    name: file.name,
    type: file.type,
    sizeBytes: size,
    language: language || 'Auto Detect',
  });
  if (size > 0 && size < 2000) {
    throw new Error('Recording too short or no audio captured. Please record again closer to the mic.');
  }

  const res = await FileSystem.uploadAsync(`${BASE}/transcribe`, file.uri, {
    httpMethod: 'POST',
    headers: authHeaders(),
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    fieldName: 'audio',
    mimeType: sttMimeType(file.type),
    parameters: { language: language || 'Auto Detect' },
  });
  console.log('[transcribe] response', { status: res.status, body: (res.body || '').slice(0, 300) });
  if (res.status < 200 || res.status >= 300) {
    let msg = 'Transcription failed';
    try {
      msg = JSON.parse(res.body)?.error || msg;
    } catch {}
    throw new Error(msg);
  }
  return JSON.parse(res.body);
}

// Resolve a server-relative media path (e.g. "/api/uploads/x.mp3") into a URL
// the player can load. Stored relative paths are prefixed with API_ROOT.
export function resolveMediaUrl(audioPath: string): string {
  if (!audioPath) return '';
  if (/^https?:\/\//i.test(audioPath)) return audioPath;
  return `${API_ROOT}${audioPath}`;
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
): Promise<{ transcript: string; rawText: string; audioUrl: string }> {
  const size = await fileSize(file.uri);
  console.log('[upload] uploading', {
    uri: file.uri,
    name: file.name,
    type: file.type,
    sizeBytes: size,
    language: options.language || 'Auto Detect',
  });
  if (size > 0 && size < 2000) {
    throw new Error('Audio file is empty or too short.');
  }

  const task = FileSystem.createUploadTask(
    `${BASE}/transcribe`,
    file.uri,
    {
      httpMethod: 'POST',
      headers: authHeaders(),
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'audio',
      mimeType: sttMimeType(file.type),
      parameters: {
        language: options.language || 'Auto Detect',
        consultationId: options.consultationId,
        persist: 'true',
      },
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
    throw new Error('Could not reach the server. Check your internet connection and try again.');
  }
  console.log('[upload] response', { status: res?.status, body: (res?.body || '').slice(0, 300) });
  if (!res || res.status < 200 || res.status >= 300) {
    let msg = 'Transcription failed';
    try {
      msg = JSON.parse(res!.body)?.error || msg;
    } catch {}
    throw new Error(msg);
  }
  return JSON.parse(res.body);
}

// Best-effort delete of a persisted upload file from server storage. Never
// throws — identical behaviour to the web client.
export async function deleteConsultationAudio(audioUrl: string): Promise<void> {
  try {
    if (!audioUrl) return;
    const fileName = audioUrl.split('/').pop();
    if (!fileName) return;
    await fetch(`${BASE}/uploads/${encodeURIComponent(fileName)}`, { method: 'DELETE' });
  } catch {
    // Storage deletion is best-effort; ignore failures.
  }
}

export async function translateTranscript(
  text: string,
  targetLanguage: string,
): Promise<string> {
  const res = await fetchWithTimeout(
    `${BASE}/translate-transcript`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ text, targetLanguage }),
    },
    120000,
  );
  if (!res.ok) throw new Error(await errorMessage(res, 'Translation failed'));
  const data = await res.json();
  return data.translatedText as string;
}

export async function generateReport(transcript: string): Promise<ReportData> {
  const res = await fetchWithTimeout(
    `${BASE}/generate-report`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
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
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(consultation),
  });
  if (!res.ok) throw new Error('Failed to save consultation');
}

export async function getPatients(): Promise<Patient[]> {
  const res = await fetch(`${BASE}/patients`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch patients');
  return res.json();
}

export async function getConsultations(): Promise<Consultation[]> {
  const res = await fetch(`${BASE}/consultations`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch consultations');
  return res.json();
}

export async function savePatient(patient: Patient): Promise<void> {
  const res = await fetch(`${BASE}/patients`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(patient),
  });
  if (!res.ok) throw new Error('Failed to save patient');
}

// ── Reports ──────────────────────────────────────────────────
export async function getReports(): Promise<ReportRecord[]> {
  const res = await fetch(`${BASE}/reports`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch reports');
  return res.json();
}

export async function saveReport(report: ReportRecord): Promise<void> {
  const res = await fetch(`${BASE}/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(report),
  });
  if (!res.ok) throw new Error('Failed to save report');
}

// ── Prescriptions ────────────────────────────────────────────
export async function getPrescriptions(): Promise<PrescriptionRecord[]> {
  const res = await fetch(`${BASE}/prescriptions`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch prescriptions');
  return res.json();
}

export async function savePrescription(prescription: PrescriptionRecord): Promise<void> {
  const res = await fetch(`${BASE}/prescriptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
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
  const res = await fetch(`${BASE}/stats`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}

// ── Transcripts ──────────────────────────────────────────────
export async function getTranscripts(): Promise<TranscriptRecord[]> {
  const res = await fetch(`${BASE}/transcripts`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch transcripts');
  return res.json();
}

export async function saveTranscript(transcript: TranscriptRecord): Promise<void> {
  const res = await fetch(`${BASE}/transcripts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(transcript),
  });
  if (!res.ok) throw new Error('Failed to save transcript');
}

// ═════════════════════════════════════════════════════════════
// Admin Dashboard API (base /api/admin) — mirrors the web client.
// Every admin call carries `Authorization: Bearer <token>`; the same
// permission matrix guards both the server routes and the client UI.
// ═════════════════════════════════════════════════════════════

// Build the auth header for a Bearer token. Spread into a fetch `headers`.
export function authHeaders(token?: string | null): Record<string, string> {
  const t = token ?? currentToken;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

const ADMIN = `${BASE}/admin`;

// Generic JSON GET with auth + timeout + server error extraction.
async function adminGet<T>(path: string, token?: string | null): Promise<T> {
  const res = await fetchWithTimeout(
    `${ADMIN}${path}`,
    { method: 'GET', headers: { ...authHeaders(token) } },
    30000,
  );
  if (!res.ok) throw new Error(await errorMessage(res, 'Request failed'));
  return res.json();
}

// Generic JSON mutation (POST/PUT/DELETE) with auth + timeout.
async function adminSend<T>(
  path: string,
  method: 'POST' | 'PUT' | 'DELETE',
  token?: string | null,
  body?: unknown,
): Promise<T> {
  const res = await fetchWithTimeout(
    `${ADMIN}${path}`,
    {
      method,
      headers: {
        ...authHeaders(token),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    },
    30000,
  );
  if (!res.ok) throw new Error(await errorMessage(res, 'Request failed'));
  // DELETE / action endpoints may return an empty body.
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// ── Auth (public) ────────────────────────────────────────────
// Login is owned by ClinicBook (shared SSO session). It lives at /api/auth/login
// (NOT under /api/mediscribe) and returns { data: { accessToken, user } }; we map
// that to the app's { token, user } shape.
export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await fetchWithTimeout(
    `${AUTH_BASE}/login`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    },
    30000,
  );
  if (!res.ok) throw new Error(await errorMessage(res, 'Login failed. Check your credentials.'));
  const body = await res.json();
  const data = body?.data ?? body;
  const token = data?.accessToken ?? data?.token;
  if (!token) throw new Error('Login failed — no token returned.');
  return { token, user: data.user } as AuthResponse;
}

// ClinicBook sign-up uses an email-OTP flow (not a one-shot register), so account
// creation is done in the ClinicBook web app; the mobile app is login-only.
export async function register(
  _name: string,
  _email: string,
  _password: string,
): Promise<AuthResponse> {
  throw new Error('Please create your clinic account on the web, then log in here.');
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

// ── Dashboard / analytics ────────────────────────────────────
export const getOverview = (token?: string | null) =>
  adminGet<AdminOverview>('/overview', token);

export const getAnalytics = (token?: string | null) =>
  adminGet<AdminAnalytics>('/analytics', token);

export const getLanguages = (token?: string | null) =>
  adminGet<LanguageUsageRow[]>('/languages', token);

// ── Doctor management ────────────────────────────────────────
export interface DoctorInput {
  name: string;
  email: string;
  password?: string;
  specialization?: string;
  licenseNumber?: string;
  hospital?: string;
  experience?: number;
  phone?: string;
}

export const getDoctors = (search: string, token?: string | null) =>
  adminGet<AuthUser[]>(`/doctors?search=${encodeURIComponent(search)}`, token);

export const createDoctor = (input: DoctorInput, token?: string | null) =>
  adminSend<AuthUser>('/doctors', 'POST', token, input);

export const updateDoctor = (id: string, input: Partial<DoctorInput>, token?: string | null) =>
  adminSend<AuthUser>(`/doctors/${id}`, 'PUT', token, input);

export const deleteDoctor = (id: string, token?: string | null) =>
  adminSend<void>(`/doctors/${id}`, 'DELETE', token);

export const suspendDoctor = (id: string, token?: string | null) =>
  adminSend<AuthUser>(`/doctors/${id}/suspend`, 'POST', token);

export const activateDoctor = (id: string, token?: string | null) =>
  adminSend<AuthUser>(`/doctors/${id}/activate`, 'POST', token);

// ── Users & roles ────────────────────────────────────────────
export const getUsers = (token?: string | null) => adminGet<AuthUser[]>('/users', token);

export const createUser = (
  input: { name: string; email: string; password: string; role: Role },
  token?: string | null,
) => adminSend<AuthUser>('/users', 'POST', token, input);

export const updateUserRole = (id: string, role: Role, token?: string | null) =>
  adminSend<AuthUser>(`/users/${id}/role`, 'PUT', token, { role });

// ── Patients ─────────────────────────────────────────────────
export const getAdminPatients = (search: string, token?: string | null) =>
  adminGet<Patient[]>(`/patients?search=${encodeURIComponent(search)}`, token);

export const deletePatient = (id: string, token?: string | null) =>
  adminSend<void>(`/patients/${id}`, 'DELETE', token);

// Matches the backend's ConsultationHistoryItem (server/services/patientHistory.ts).
// The endpoint returns a FLAT ARRAY of these, one per consultation — not a
// {consultations, reports} object.
export interface HistoryMedicine {
  medicine: string;
  strength: string;
  dose: string;
  frequency: string;
  duration: string;
  instructions: string;
}

export interface ConsultationHistoryItem {
  consultationId: string;
  visitDateTime: string;
  chiefComplaints: string[];
  diagnosis: string[];
  medicines: HistoryMedicine[];
  reportStatus: 'Draft' | 'Completed';
  followUp: string;
  reportId: string | null;
  transcriptId: string | null;
  hasReport: boolean;
  transcriptText: string;
}

export const getPatientHistory = (id: string, token?: string | null) =>
  adminGet<ConsultationHistoryItem[]>(`/patients/${id}/history?order=desc`, token);

// ── Consultations ────────────────────────────────────────────
export const getAdminConsultations = (
  bucket: ConsultationBucket,
  search: string,
  token?: string | null,
) =>
  adminGet<Consultation[]>(
    `/consultations?bucket=${bucket}&search=${encodeURIComponent(search)}`,
    token,
  );

export const retryConsultation = (id: string, token?: string | null) =>
  adminSend<Consultation>(`/consultations/${id}/retry`, 'POST', token);

export const deleteConsultation = (id: string, token?: string | null) =>
  adminSend<void>(`/consultations/${id}`, 'DELETE', token);

// ── Reports ──────────────────────────────────────────────────
export const getAdminReports = (search: string, token?: string | null) =>
  adminGet<ReportRecord[]>(`/reports?search=${encodeURIComponent(search)}`, token);

export const deleteReport = (id: string, token?: string | null) =>
  adminSend<void>(`/reports/${id}`, 'DELETE', token);

// ── Settings ─────────────────────────────────────────────────
export const getSettings = (token?: string | null) =>
  adminGet<AdminSettings>('/settings', token);

export const updateSettings = (settings: AdminSettings, token?: string | null) =>
  adminSend<AdminSettings>('/settings', 'PUT', token, settings);

export const triggerBackup = (token?: string | null) =>
  adminSend<{ lastBackupAt: string }>('/backup', 'POST', token);

// ── Notifications ────────────────────────────────────────────
export const getNotifications = (token?: string | null) =>
  adminGet<AdminNotification[]>('/notifications', token);

export const markNotificationRead = (id: string, token?: string | null) =>
  adminSend<void>(`/notifications/${id}/read`, 'POST', token);

export const markAllNotificationsRead = (token?: string | null) =>
  adminSend<void>('/notifications/read-all', 'POST', token);

// ── Global search ────────────────────────────────────────────
export const globalSearch = (q: string, token?: string | null) =>
  adminGet<GlobalSearchResponse>(`/search?q=${encodeURIComponent(q)}`, token);
