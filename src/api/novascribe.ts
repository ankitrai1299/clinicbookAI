import { API_BASE, ApiError, apiFetch } from './client';

export type NoteStatus =
  | 'AWAITING_AUDIO'
  | 'PROCESSING'
  | 'DRAFTED'
  | 'REVIEWED'
  | 'FINALIZED'
  | 'FAILED';

export interface PrescriptionItem {
  drug: string;
  dose: string;
  frequency: string;
  duration: string;
  notes: string;
  flagged?: boolean;
  canonical?: string;
}

export interface TranscriptSegment {
  speaker?: string;
  text: string;
  startSec?: number;
  endSec?: number;
}

export interface ConsultationNote {
  id: string;
  clinicId: string;
  appointmentId?: string | null;
  patientId?: string | null;
  doctorId?: string | null;
  patientName?: string | null;
  doctorName?: string | null;
  status: NoteStatus;
  audioPath?: string | null;
  language?: string | null;
  durationSec?: number | null;
  errorMessage?: string | null;
  transcript?: string | null;
  segments?: TranscriptSegment[] | null;
  subjective?: string | null;
  objective?: string | null;
  assessment?: string | null;
  plan?: string | null;
  prescription?: PrescriptionItem[] | null;
  evidence?: Record<string, Array<{ quote: string }>> | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export const listNotes = (status?: NoteStatus) =>
  apiFetch<ConsultationNote[]>(`/api/novascribe/notes${status ? `?status=${status}` : ''}`);

export const getNote = (id: string) =>
  apiFetch<ConsultationNote>(`/api/novascribe/notes/${id}`);

export const createDraft = (body: {
  patientName?: string;
  doctorName?: string;
  patientId?: string;
  doctorId?: string;
  appointmentId?: string;
}) =>
  apiFetch<ConsultationNote>('/api/novascribe/notes', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const transcribe = (id: string, transcript: string) =>
  apiFetch<ConsultationNote>(`/api/novascribe/notes/${id}/transcribe`, {
    method: 'POST',
    body: JSON.stringify({ transcript }),
  });

export const reviewNote = (
  id: string,
  body: {
    subjective?: string;
    objective?: string;
    assessment?: string;
    plan?: string;
    prescription?: PrescriptionItem[];
    finalize?: boolean;
  }
) =>
  apiFetch<ConsultationNote>(`/api/novascribe/notes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

// Audio upload is multipart/form-data, so it can't use apiFetch (which forces
// application/json). Let the browser set the multipart boundary itself.
export const uploadAudio = async (
  id: string,
  audio: Blob,
  filename: string,
  language?: string
): Promise<ConsultationNote> => {
  const token = localStorage.getItem('auth_token');
  const form = new FormData();
  form.append('audio', audio, filename);
  if (language) form.append('language', language);

  const res = await fetch(`${API_BASE}/api/novascribe/notes/${id}/audio`, {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: form,
  });

  const json = await res.json().catch(() => ({ message: 'Unexpected server error' }));
  if (!res.ok) {
    throw new ApiError(res.status, (json as { message?: string }).message ?? res.statusText);
  }
  return (json as { data: ConsultationNote }).data;
};
