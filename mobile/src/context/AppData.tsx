import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import {
  Patient,
  Consultation,
  ReportRecord,
  PrescriptionRecord,
  TranscriptRecord,
} from '../types';
import {
  getPatients,
  getConsultations,
  getReports,
  getPrescriptions,
  getTranscripts,
  savePatient,
  saveConsultation,
} from '../services/api';

// Stable id generator (RN has no crypto.randomUUID guarantee).
const uid = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

// ── Normalizers (ported verbatim from the web App.tsx) ────────
const normalizePatient = (item: Partial<Patient> = {}): Patient => ({
  id: item.id || uid('pat'),
  name: item.name || 'Unknown Patient',
  age: typeof item.age === 'number' ? item.age : 0,
  gender: item.gender || 'Unknown',
  phone: item.phone,
});

const normalizeConsultation = (item: Partial<Consultation> = {}): Consultation => ({
  id: item.id || uid('con'),
  patientId: item.patientId || '',
  patientName: item.patientName || 'Unknown Patient',
  date: item.date || new Date().toISOString(),
  status: item.status || 'Draft',
  transcript: Array.isArray(item.transcript) ? item.transcript : [],
  report: item.report,
  audioUrl: item.audioUrl,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
  // Preserve mobile-persisted extras so they survive a reload from the backend
  // (transcript text, recording length, and the report version history).
  transcriptText: item.transcriptText,
  originalTranscript: item.originalTranscript,
  durationSec: item.durationSec,
  reportVersions: Array.isArray(item.reportVersions) ? item.reportVersions : undefined,
});

interface AppDataValue {
  patients: Patient[];
  consultations: Consultation[];
  reports: ReportRecord[];
  prescriptions: PrescriptionRecord[];
  transcripts: TranscriptRecord[];
  loading: boolean;
  reload: () => Promise<void>;
  addPatient: (name: string, age: number, gender: string, phone: string) => Patient;
  startSessionForPatient: (patientId: string, patientName: string) => Consultation;
  updateSession: (updated: Consultation) => void;
}

const AppDataContext = createContext<AppDataValue | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [prescriptions, setPrescriptions] = useState<PrescriptionRecord[]>([]);
  const [transcripts, setTranscripts] = useState<TranscriptRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Load everything from MongoDB (via backend) — single source of truth. Each
  // call is independently fault-tolerant so one failing endpoint can't blank the
  // whole app. (Mirrors the web App.loadData.)
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [p, c, r, pr, t] = await Promise.all([
        getPatients().catch(() => []),
        getConsultations().catch(() => []),
        getReports().catch(() => []),
        getPrescriptions().catch(() => []),
        getTranscripts().catch(() => []),
      ]);
      setPatients((Array.isArray(p) ? p : []).map(normalizePatient));
      setConsultations((Array.isArray(c) ? c : []).map(normalizeConsultation));
      setReports(Array.isArray(r) ? r : []);
      setPrescriptions(Array.isArray(pr) ? pr : []);
      setTranscripts(Array.isArray(t) ? t : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Create a patient, add to state, persist (fire-and-forget) — same as web.
  const addPatient = useCallback(
    (name: string, age: number, gender: string, phone: string): Patient => {
      const newPat: Patient = { id: uid('pat'), name, age, gender, phone };
      setPatients((prev) => [newPat, ...prev]);
      savePatient(newPat).catch((err) => console.error('Save patient error:', err));
      return newPat;
    },
    [],
  );

  // Create a fresh Draft session, add it to state, and persist immediately so a
  // crash/refresh before the first save doesn't lose it. (Mirrors web.)
  const startSessionForPatient = useCallback(
    (patientId: string, patientName: string): Consultation => {
      const now = new Date().toISOString();
      const newCon: Consultation = {
        id: uid('con'),
        patientId,
        patientName,
        date: new Date().toLocaleDateString(),
        status: 'Draft',
        transcript: [],
        audioUrl: '',
        createdAt: now,
        updatedAt: now,
      };
      setConsultations((prev) => [newCon, ...prev]);
      saveConsultation(newCon).catch((err) =>
        console.error('Persist new session error:', err),
      );
      return newCon;
    },
    [],
  );

  // Keep the session list in sync with live workspace edits/saves (auto-save).
  const updateSession = useCallback((updated: Consultation) => {
    setConsultations((prev) => {
      const exists = prev.find((c) => c.id === updated.id);
      return exists
        ? prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
        : [updated, ...prev];
    });
  }, []);

  return (
    <AppDataContext.Provider
      value={{
        patients,
        consultations,
        reports,
        prescriptions,
        transcripts,
        loading,
        reload,
        addPatient,
        startSessionForPatient,
        updateSession,
      }}
    >
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData(): AppDataValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider');
  return ctx;
}
