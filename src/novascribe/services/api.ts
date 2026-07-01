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

// Served by the main ClinicBook backend under /api/nova (auth + per-clinic).
// API_ROOT is the backend origin (VITE_API_URL); empty in same-origin setups.
const API_ROOT = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
const BASE = `${API_ROOT}/api/nova`;

// Attach the logged-in clinic's JWT (shared with the rest of the app).
function authHeader(): Record<string, string> {
  const token = localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function jsonHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', ...authHeader() };
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    if (data?.error) return data.error as string;
    if (data?.message) return data.message as string;
  } catch {
    /* no JSON body */
  }
  return fallback;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('The request timed out. Please check your connection and try again.');
    }
    throw new Error('Could not reach the server. Make sure the backend is running, then try again.');
  } finally {
    clearTimeout(timer);
  }
}

export async function transcribeAudio(
  blob: Blob,
  language?: string,
): Promise<{ transcript: string; rawText: string; audioUrl: string }> {
  const form = new FormData();
  form.append('audio', blob, 'consultation.webm');
  form.append('language', language || 'Auto Detect');
  // Do NOT set Content-Type — the browser sets the multipart boundary itself.
  const res = await fetchWithTimeout(`${BASE}/transcribe`, { method: 'POST', headers: authHeader(), body: form }, 180000);
  if (!res.ok) throw new Error(await errorMessage(res, 'Transcription failed'));
  return res.json();
}

export function resolveMediaUrl(audioPath: string): string {
  if (!audioPath) return '';
  if (/^https?:\/\//i.test(audioPath)) return audioPath;
  return `${API_ROOT}${audioPath}`;
}

export function uploadConsultationAudio(
  file: File,
  options: { consultationId: string; language?: string; onProgress?: (percent: number) => void },
): Promise<{ transcript: string; rawText: string; audioUrl: string }> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('audio', file, file.name);
    form.append('language', options.language || 'Auto Detect');
    form.append('consultationId', options.consultationId);
    form.append('persist', 'true');

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}/transcribe`);
    const token = localStorage.getItem('auth_token');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.timeout = 180000;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && options.onProgress) options.onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data: any = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* non-JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data?.error || data?.message || 'Transcription failed'));
    };
    xhr.onerror = () => reject(new Error('Could not reach the server. Make sure the backend is running, then try again.'));
    xhr.ontimeout = () => reject(new Error('The upload timed out. Please check your connection and try again.'));
    xhr.send(form);
  });
}

export async function deleteConsultationAudio(audioUrl: string): Promise<void> {
  try {
    if (!audioUrl) return;
    const fileName = audioUrl.split('/').pop();
    if (!fileName) return;
    await fetch(`${BASE}/uploads/${encodeURIComponent(fileName)}`, { method: 'DELETE', headers: authHeader() });
  } catch {
    /* best-effort */
  }
}

export async function translateTranscript(text: string, targetLanguage: string): Promise<string> {
  const res = await fetchWithTimeout(
    `${BASE}/translate-transcript`,
    { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ text, targetLanguage }) },
    120000,
  );
  if (!res.ok) throw new Error(await errorMessage(res, 'Translation failed'));
  return (await res.json()).translatedText as string;
}

export async function generateReport(transcript: string): Promise<ReportData> {
  const res = await fetchWithTimeout(
    `${BASE}/generate-report`,
    { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ transcript }) },
    180000,
  );
  if (!res.ok) throw new Error(await errorMessage(res, 'Report generation failed'));
  return res.json();
}

export async function saveConsultation(consultation: Consultation): Promise<void> {
  const res = await fetch(`${BASE}/save-consultation`, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(consultation) });
  if (!res.ok) throw new Error('Failed to save consultation');
}

export async function getPatients(): Promise<Patient[]> {
  const res = await fetch(`${BASE}/patients`, { headers: authHeader() });
  if (!res.ok) throw new Error('Failed to fetch patients');
  return res.json();
}

export async function getConsultations(): Promise<Consultation[]> {
  const res = await fetch(`${BASE}/consultations`, { headers: authHeader() });
  if (!res.ok) throw new Error('Failed to fetch consultations');
  return res.json();
}

// Upcoming ClinicBook appointments (shared) so the doctor can scribe a visit.
export async function getUpcomingAppointments(): Promise<UpcomingAppointment[]> {
  const res = await fetch(`${BASE}/appointments/upcoming`, { headers: authHeader() });
  if (!res.ok) throw new Error('Failed to fetch upcoming appointments');
  return res.json();
}

export async function getPatientHistory(patientId: string, order: 'asc' | 'desc' = 'asc'): Promise<ConsultationHistoryItem[]> {
  const res = await fetch(`${BASE}/patients/${encodeURIComponent(patientId)}/history?order=${order}`, { headers: authHeader() });
  if (!res.ok) throw new Error(await errorMessage(res, 'Failed to fetch consultation history'));
  return res.json();
}

export async function savePatient(patient: Patient): Promise<void> {
  const res = await fetch(`${BASE}/patients`, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(patient) });
  if (!res.ok) throw new Error('Failed to save patient');
}

export async function getReports(): Promise<ReportRecord[]> {
  const res = await fetch(`${BASE}/reports`, { headers: authHeader() });
  if (!res.ok) throw new Error('Failed to fetch reports');
  return res.json();
}
export async function saveReport(report: ReportRecord): Promise<void> {
  const res = await fetch(`${BASE}/reports`, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(report) });
  if (!res.ok) throw new Error('Failed to save report');
}

export async function getPrescriptions(): Promise<PrescriptionRecord[]> {
  const res = await fetch(`${BASE}/prescriptions`, { headers: authHeader() });
  if (!res.ok) throw new Error('Failed to fetch prescriptions');
  return res.json();
}
export async function savePrescription(prescription: PrescriptionRecord): Promise<void> {
  const res = await fetch(`${BASE}/prescriptions`, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(prescription) });
  if (!res.ok) throw new Error('Failed to save prescription');
}

export interface DashboardStats {
  patients: number; consultations: number; reports: number; prescriptions: number; transcripts: number;
}
export async function getStats(): Promise<DashboardStats> {
  const res = await fetch(`${BASE}/stats`, { headers: authHeader() });
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}

export async function getTranscripts(): Promise<TranscriptRecord[]> {
  const res = await fetch(`${BASE}/transcripts`, { headers: authHeader() });
  if (!res.ok) throw new Error('Failed to fetch transcripts');
  return res.json();
}
export async function saveTranscript(transcript: TranscriptRecord): Promise<void> {
  const res = await fetch(`${BASE}/transcripts`, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(transcript) });
  if (!res.ok) throw new Error('Failed to save transcript');
}
