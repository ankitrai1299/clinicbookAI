import { apiFetch } from './client';

export interface PatientRecordBooking {
  id: string;
  date: string;
  time: string;
  status: string;
  doctorName: string | null;
  speciality: string | null;
}

export interface PatientRecordMedicine {
  drug: string;
  times: string[];
  startDate: string;
  endDate: string | null;
  nextRunAt: string;
  active: boolean;
}

export interface PatientRecordConsultation {
  consultationId: string;
  visitDateTime: string;
  chiefComplaints: string[];
  diagnosis: string[];
  medicines: Array<{ medicine: string; strength?: string; dose?: string; frequency?: string; duration?: string }>;
  reportStatus: 'Draft' | 'Completed';
  followUp: string;
}

export interface PatientRecord {
  patient: {
    id: string;
    patientCode: string | null;
    name: string;
    age: number | null;
    gender: string | null;
    phone: string;
    language: string;
    healthConcern: string | null;
    registeredAt: string;
  };
  bookings: PatientRecordBooking[];
  consultations: PatientRecordConsultation[];
  medicines: PatientRecordMedicine[];
  summary: { totalBookings: number; totalConsultations: number; activeMedicines: number };
}

// One patient id (internal cuid) OR Patient Code (PT-XXXX) → their full record.
export const getPatientRecord = (idOrCode: string) =>
  apiFetch<PatientRecord>(`/api/patient-record/${encodeURIComponent(idOrCode)}`);
