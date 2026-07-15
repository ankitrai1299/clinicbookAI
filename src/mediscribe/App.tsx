import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import {
  Patient,
  Consultation,
  ReportData,
  TranscriptLine,
  ReportRecord,
  PrescriptionRecord,
  TranscriptRecord,
  UpcomingAppointment,
} from './types';
import { Menu, X, ArrowLeft } from 'lucide-react';
// Eagerly loaded shell — the only chunks on the first-paint critical path.
import Logo from './components/Logo';
import Sidebar from './components/Sidebar';
import { useAuth } from './context/Auth';
import type { Permission } from './contracts';
import { isMobileApp } from './utils/platform';
// Native-style phone-app shell (WebView only — never used by the web).
const MobileShell = lazy(() => import('./mobile/MobileShell'));
const MobileHome = lazy(() => import('./mobile/MobileHome'));
// Code-split every view so they are not part of the initial bundle. This also
// keeps `motion` (the animation lib, only used by the views) off the first-paint
// path. The dashboard already shows a "Loading…" state during its data fetch, so
// lazy-loading it adds no perceived delay (the chunk loads alongside the API
// calls). ConsultationWorkspace is the biggest win — ~1.8k lines plus the audio
// player, needed only once a consultation is opened.
const DashboardView = lazy(() => import('./components/DashboardView'));
const PatientSelectModal = lazy(() => import('./components/PatientSelectModal'));
const ConsultationWorkspace = lazy(() => import('./components/ConsultationWorkspace'));
const PatientsView = lazy(() => import('./components/PatientsView'));
const GenericListView = lazy(() => import('./components/GenericListView'));
const AdminApp = lazy(() => import('./components/admin/AdminApp'));
import {
  getPatients,
  getConsultations,
  getReports,
  getPrescriptions,
  getTranscripts,
  getUpcomingAppointments,
  savePatient,
  saveConsultation,
} from './services/api';
import { medicationsToText } from './utils/report';

// Main Views
type ViewState = 'dashboard' | 'patients' | 'consultations' | 'transcripts' | 'reports' | 'prescriptions' | 'settings' | 'admin';

const VIEW_TITLES: Record<ViewState, string> = {
  dashboard: 'Dashboard',
  patients: 'Patients',
  consultations: 'Sessions',
  transcripts: 'Transcripts',
  reports: 'AI Reports',
  prescriptions: 'Prescriptions',
  settings: 'Settings',
  admin: 'Admin',
};

// ── Sessions page date search helpers ─────────────────────────
// Sortable timestamp for a session: updatedAt → createdAt → display date.
const sessionTime = (c: Consultation): number => {
  const raw = c?.updatedAt || c?.createdAt || c?.date;
  const parsed = raw ? Date.parse(raw) : NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
};

// The session's year/month/day, derived from its best available timestamp.
const sessionYMD = (c: Consultation): { y: number; m: number; d: number } | null => {
  const raw = c?.updatedAt || c?.createdAt || c?.date;
  const d = raw ? new Date(raw) : null;
  if (d && !Number.isNaN(d.getTime())) return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
  return null;
};

// Parse a typed date query into candidate {y,m,d}s, trying BOTH MM/DD/YYYY and
// DD/MM/YYYY so either format the user types resolves to the same day.
const parseDateQuery = (q: string): { y: number; m: number; d: number }[] => {
  const parts = q.split(/[/\-.]/).map(p => p.trim()).filter(Boolean);
  if (parts.length !== 3) return [];
  const [a, b, c] = parts.map(Number);
  if ([a, b, c].some(n => Number.isNaN(n))) return [];
  const candidates: { y: number; m: number; d: number }[] = [];
  if (a >= 1 && a <= 12 && b >= 1 && b <= 31) candidates.push({ m: a, d: b, y: c }); // MM/DD/YYYY
  if (b >= 1 && b <= 12 && a >= 1 && a <= 31) candidates.push({ m: b, d: a, y: c }); // DD/MM/YYYY
  return candidates;
};

// Does a session match the search query? Full dates match by day (either
// format); otherwise fall back to a substring match on the display date.
const sessionMatchesDate = (c: Consultation, q: string): boolean => {
  const candidates = parseDateQuery(q);
  if (candidates.length) {
    const t = sessionYMD(c);
    return !!t && candidates.some(cd => cd.y === t.y && cd.m === t.m && cd.d === t.d);
  }
  return (c?.date || '').toLowerCase().includes(q.toLowerCase());
};

// Sessions ordering for the Sessions page: matches first, everything sorted
// newest-updated first. Empty query → plain latest-first. Single partition pass,
// so no session is ever duplicated.
const sessionSearchOrder = (items: Consultation[], rawQuery: string): Consultation[] => {
  const sorted = [...items].sort((a, b) => sessionTime(b) - sessionTime(a));
  const q = (rawQuery || '').trim();
  if (!q) return sorted;
  const matches: Consultation[] = [];
  const rest: Consultation[] = [];
  for (const s of sorted) (sessionMatchesDate(s, q) ? matches : rest).push(s);
  return [...matches, ...rest];
};

interface MediscribeAppProps {
  // Provided when hosted inside the ClinicBook platform hub (full-screen takeover).
  onExitToHub?: () => void;
  doctorName?: string;
}

export default function App({ onExitToHub, doctorName }: MediscribeAppProps = {}) {
  // Mounted inside the host app shell (the platform hub owns URL routing), so the
  // view is plain in-memory state starting at the dashboard.
  const [activeView, setActiveView] = useState<ViewState>('dashboard');

  // ── RBAC ──────────────────────────────────────────────────────────────────
  // The logged-in user's role decides which views are visible/accessible. Each
  // view maps to a permission; the sidebar hides what the role can't see, and a
  // role that lands on (or deep-links to) a view it can't access is redirected to
  // its first allowed view. Access is entirely from the authenticated session.
  const { user, hasPermission } = useAuth();
  const VIEW_PERM: Record<ViewState, Permission> = {
    dashboard: 'dashboard.view',
    patients: 'patients.view',
    consultations: 'consultations.view',
    transcripts: 'consultations.view',
    reports: 'reports.view',
    prescriptions: 'reports.view',
    settings: 'settings.view',
    admin: 'analytics.view',
  };
  // Permissive until the user is loaded, so the menu doesn't flash empty.
  const canView = (p: Permission): boolean => !user || hasPermission(p);
  const VIEW_ORDER: ViewState[] = ['dashboard', 'patients', 'consultations', 'transcripts', 'reports', 'prescriptions', 'settings', 'admin'];
  useEffect(() => {
    if (!user) return;
    if (!hasPermission(VIEW_PERM[activeView])) {
      const first = VIEW_ORDER.find((v) => hasPermission(VIEW_PERM[v]));
      if (first && first !== activeView) setActiveView(first);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeView]);

  // On first login, land on the role's HOME panel: an Admin (Clinic Admin / Super
  // Admin) opens straight into the Admin console; a Doctor opens the scribe
  // Dashboard; front-desk Staff opens Patients.
  const landedRef = useRef(false);
  useEffect(() => {
    if (!user || landedRef.current) return;
    landedRef.current = true;
    const firstAllowed = (): ViewState =>
      hasPermission(VIEW_PERM.dashboard)
        ? 'dashboard'
        : VIEW_ORDER.find((v) => hasPermission(VIEW_PERM[v])) ?? 'dashboard';
    // In the PHONE APP everyone (admins included) lands on the native Dashboard —
    // the Admin console is reachable from the bottom-bar Admin tab. This also
    // avoids a flash of the dashboard before bouncing to the console. On the WEB,
    // admins still open straight into the Admin console as before.
    const home: ViewState = isMobileApp()
      ? firstAllowed()
      : user.role === 'superadmin' || user.role === 'hospital_admin'
        ? 'admin'
        : firstAllowed();
    setActiveView(home);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const [patients, setPatients] = useState<Patient[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [prescriptions, setPrescriptions] = useState<PrescriptionRecord[]>([]);
  const [transcripts, setTranscripts] = useState<TranscriptRecord[]>([]);
  const [upcomingAppointments, setUpcomingAppointments] = useState<UpcomingAppointment[]>([]);
  const [loading, setLoading] = useState(true);

  const [isPatientModalOpen, setIsPatientModalOpen] = useState(false);
  const [activeConsultation, setActiveConsultation] = useState<Consultation | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Navigation entries for the mobile dropdown menu (mirrors the desktop sidebar).
  const ALL_MOBILE_NAV: { id: ViewState; label: string }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'patients', label: 'Patients' },
    { id: 'consultations', label: 'Sessions' },
    { id: 'settings', label: 'Settings' },
    { id: 'admin', label: 'Admin' },
  ];
  const mobileNavItems = ALL_MOBILE_NAV.filter((item) => canView(VIEW_PERM[item.id]));

  // Normalize raw API/MongoDB records so incomplete documents can't crash rendering
  const normalizePatient = (item: Partial<Patient> = {}): Patient => ({
    id: item.id || crypto.randomUUID(),
    name: item.name || "Unknown Patient",
    age: typeof item.age === 'number' ? item.age : 0,
    gender: item.gender || "Unknown",
    phone: item.phone,
  });

  const normalizeConsultation = (item: Partial<Consultation> = {}): Consultation => ({
    id: item.id || crypto.randomUUID(),
    patientId: item.patientId || "",
    patientName: item.patientName || "Unknown Patient",
    date: item.date || new Date().toISOString(),
    status: item.status || "Draft",
    transcript: Array.isArray(item.transcript) ? item.transcript : [],
    report: item.report,
    audioUrl: item.audioUrl,
  });

  // Load all data from MongoDB (via backend) — the single source of truth. There
  // is no localStorage/sessionStorage/cache/mock layer anywhere, so what renders
  // is always exactly what the database currently holds. `silent` refreshes in
  // place without the full-screen "Loading…" flash (used by the dashboard-open
  // refetch below).
  const loadData = async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const [p, c, r, pr, t, ua] = await Promise.all([
        getPatients().catch(() => null), // null = fetch failed (vs. [] = no patients)
        getConsultations().catch(() => []),
        getReports().catch(() => []),
        getPrescriptions().catch(() => []),
        getTranscripts().catch(() => []),
        getUpcomingAppointments().catch(() => []),
      ]);
      setUpcomingAppointments(Array.isArray(ua) ? ua : []);

      const patientsData = (Array.isArray(p) ? p : []).map(normalizePatient);
      setPatients(patientsData);

      // Drop ORPHANED sessions — consultations whose patient has been deleted from
      // the database — so a removed patient (e.g. deleted straight from MongoDB)
      // no longer lingers in Recent Consultations. Only filter when the patients
      // list actually loaded (p is an array); if that request failed we keep every
      // session rather than hide them all on a transient error.
      const patientIds = new Set(patientsData.map(pt => pt.id));
      const allConsults = (Array.isArray(c) ? c : []).map(normalizeConsultation);
      setConsultations(
        Array.isArray(p)
          ? allConsults.filter(con => !con.patientId || patientIds.has(con.patientId))
          : allConsults,
      );

      setReports(Array.isArray(r) ? r : []);
      setPrescriptions(Array.isArray(pr) ? pr : []);
      setTranscripts(Array.isArray(t) ? t : []);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Whenever the user opens the Dashboard, silently re-fetch from the backend so
  // externally-changed data (e.g. a patient/consultation deleted directly in
  // MongoDB) is reflected without a hard page reload. The initial mount is skipped
  // because loadData() already ran above.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return; }
    if (activeView === 'dashboard') loadData({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView]);

  // Update the document title only — URL routing is owned by the host app shell.
  useEffect(() => {
    document.title = `MediScribe AI — ${VIEW_TITLES[activeView]}`;
  }, [activeView]);

  // Handlers
  const handleStartNewConsultation = () => {
    setIsPatientModalOpen(true);
  };

  // Create a fresh Draft session for a patient, add it to local state, make it
  // active, and persist it immediately so a refresh before the first save does
  // not lose it.
  const startSessionForPatient = (patientId: string, patientName: string) => {
    const now = new Date().toISOString();
    const newCon: Consultation = {
      id: `con-${Date.now()}`,
      patientId,
      patientName,
      date: new Date().toLocaleDateString(),
      status: 'Draft',
      transcript: [],
      audioUrl: '',
      createdAt: now,
      updatedAt: now,
    };

    setConsultations(prev => [newCon, ...prev]);
    setActiveConsultation(newCon);
    saveConsultation(newCon).catch(err => console.error('Persist new session error:', err));
  };

  const handleSelectPatientForNewConsultation = (patient: Patient) => {
    setIsPatientModalOpen(false);
    startSessionForPatient(patient.id, patient.name);
  };

  // "+ New Session" from inside the workspace — start a new session for the
  // patient of the currently active session.
  const handleNewSession = () => {
    if (activeConsultation) {
      startSessionForPatient(activeConsultation.patientId, activeConsultation.patientName);
    }
  };

  // Auto-save / live updates from the workspace keep the session list in sync
  // (e.g. status flips to Completed, chief complaint appears) without a reload.
  const handleSessionUpdate = (updated: Consultation) => {
    setConsultations(prev => {
      const exists = prev.find(c => c.id === updated.id);
      return exists
        ? prev.map(c => (c.id === updated.id ? { ...c, ...updated } : c))
        : [updated, ...prev];
    });
  };

  const handleAddPatient = async (name: string, age: number, gender: string, phone: string) => {
    const draft: Patient = { id: `pat-${Date.now()}`, name, age, gender, phone };
    try {
      // Persist to ClinicBook (shared) and use the REAL patient id it returns so
      // the consultation links to the same patient the whole clinic sees.
      const saved = await savePatient(draft);
      setPatients(prev => [saved, ...prev]);
      handleSelectPatientForNewConsultation(saved);
    } catch (err) {
      console.error('Save patient error:', err);
      // Don't block the doctor — fall back to the local draft.
      setPatients(prev => [draft, ...prev]);
      handleSelectPatientForNewConsultation(draft);
    }
  };

  const handleSelectExistingConsultation = (con: Consultation) => {
    setActiveConsultation(con);
  };

  const handleFinishConsultation = (updatedReport: ReportData, transcript: TranscriptLine[]) => {
    if (activeConsultation) {
      const updatedCon: Consultation = {
        ...activeConsultation,
        // Generating a report does NOT complete the session — it is an edit, so
        // the status stays Draft until the user clicks Save.
        status: 'Draft',
        transcript,
        report: updatedReport
      };

      setActiveConsultation(updatedCon);
      setConsultations(prev => {
        const exists = prev.find(c => c.id === updatedCon.id);
        if (exists) {
          return prev.map(c => c.id === updatedCon.id ? updatedCon : c);
        }
        return [updatedCon, ...prev];
      });
    }
  };

  // ConsultationWorkspace persists everything to MongoDB on Save, then calls this.
  // Refresh the data from MongoDB so the other pages (dashboard, lists) reflect
  // the saved record — but DO NOT navigate away: the user stays on the same
  // session. (No redirect, no page reload.)
  const handleSaveReport = (_report: ReportData) => {
    loadData();
  };

  const Loading = () => (
    <div className="p-12 text-center text-slate-500">Loading...</div>
  );

  // View Switcher
  const renderActiveView = () => {
    switch (activeView) {
      case 'dashboard':
        return (
          <DashboardView
            consultations={consultations}
            patientsCount={patients.length}
            reportsCount={reports.length}
            prescriptionsCount={prescriptions.length}
            upcomingAppointments={upcomingAppointments}
            onStartNew={handleStartNewConsultation}
            onSelectConsultation={handleSelectExistingConsultation}
            onScribeAppointment={(a) => startSessionForPatient(a.patientId, a.patientName)}
          />
        );
      case 'patients':
        return (
          <PatientsView
            patients={patients}
            consultations={consultations}
            onOpenConsultation={handleSelectExistingConsultation}
          />
        );
      case 'consultations':
        return (
          <GenericListView
            title="Sessions"
            description="All recorded consultation sessions."
            items={consultations}
            emptyMessage={loading ? 'Loading...' : 'No sessions found.'}
            searchable={true}
            searchPlaceholder="Search sessions by date (MM/DD/YYYY)"
            transformItems={sessionSearchOrder}
            renderItem={(c: Consultation) => (
              <div key={c.id} onClick={() => handleSelectExistingConsultation(c)} className="p-4 hover:bg-slate-50 cursor-pointer flex justify-between items-center">
                <div>
                  <div className="font-semibold text-slate-900">{c.patientName || 'Unknown Patient'}</div>
                  <div className="text-sm text-slate-500 mt-0.5">{c.date}</div>
                </div>
                <div className={`px-2.5 py-1 rounded-md text-xs font-semibold ${c.status === 'Completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                  {c.status}
                </div>
              </div>
            )}
          />
        );
      case 'transcripts':
        return (
          <GenericListView
            title="Transcripts"
            description="Searchable patient transcripts from sessions."
            items={transcripts}
            emptyMessage={loading ? 'Loading...' : 'No transcripts saved.'}
            searchable={true}
            searchPlaceholder="Search conversations..."
            renderItem={(t: TranscriptRecord) => (
              <div key={t.id} className="p-4 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0 block">
                <div className="flex justify-between items-center mb-2">
                  <div className="font-semibold text-slate-900">{t.patientName || 'Unknown Patient'}</div>
                  <div className="text-sm text-slate-500">{t.date}</div>
                </div>
                <p className="text-sm text-slate-600 line-clamp-2">
                  {t.transcriptText || t.transcript?.[0]?.text || "No audio recorded."}
                </p>
              </div>
            )}
          />
        );
      case 'reports':
        return (
          <GenericListView
            title="AI Clinical Reports"
            description="Generated structured reports."
            items={reports}
            emptyMessage={loading ? 'Loading...' : 'No reports generated yet.'}
            renderItem={(r: ReportRecord) => (
              <div key={r.id} className="p-4 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0 block">
                <div className="flex justify-between items-center mb-1">
                  <div className="font-semibold text-slate-900">{r.patientName || 'Unknown Patient'}</div>
                  <div className="text-sm text-slate-500">{r.date}</div>
                </div>
                <p className="text-sm text-slate-600 line-clamp-2 mb-2">
                  <span className="font-semibold text-slate-800">CC:</span> {r.report?.chiefComplaint?.join('; ')}
                </p>
              </div>
            )}
          />
        );
      case 'prescriptions':
         return (
          <GenericListView
            title="Prescriptions"
            description="Extracted medications and advice."
            items={prescriptions}
            emptyMessage={loading ? 'Loading...' : 'No prescriptions recorded.'}
            renderItem={(p: PrescriptionRecord) => (
              <div key={p.id} className="p-4 hover:bg-slate-50 border-b border-slate-100 last:border-0 block">
                <div className="flex justify-between items-center mb-2">
                  <div className="font-semibold text-slate-900">{p.patientName || 'Unknown Patient'}</div>
                  <div className="text-sm text-slate-500">{p.date}</div>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-sm text-slate-800 whitespace-pre-line">
                  {medicationsToText(p.prescribedMedications) || (p.advice || []).join('\n') || 'No medications recorded.'}
                </div>
              </div>
            )}
          />
        );
      case 'settings':
        return (
          <div className="p-8 text-center text-slate-500">
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Settings</h1>
            Language & Microphone configurations.
          </div>
        );
      default:
        return null;
    }
  };

  // The Admin console is a self-contained, full-screen area with its own
  // sub-navigation and auth gate — it takes over the whole viewport (no outer
  // sidebar / max-width wrapper).
  if (activeView === 'admin' && !activeConsultation) {
    return (
      <Suspense fallback={<Loading />}>
        <AdminApp onExit={() => setActiveView('dashboard')} />
      </Suspense>
    );
  }

  // PHONE APP ONLY (WebView): native-style bottom-tab shell. The web (desktop +
  // mobile browser) skips this entirely and renders the layout below unchanged.
  // Active consultations still use the shared workspace (handled by the main
  // return), so recording/report editing is identical everywhere.
  if (isMobileApp() && !activeConsultation) {
    return (
      <>
        <Suspense fallback={<Loading />}>
          <MobileShell
            activeView={activeView}
            onNavigate={(v) => setActiveView(v as ViewState)}
            canView={canView}
          >
            {activeView === 'dashboard' ? (
              <MobileHome
                consultations={consultations}
                doctorName={doctorName}
                onStartNew={handleStartNewConsultation}
                onSelectConsultation={handleSelectExistingConsultation}
                onViewAllSessions={() => setActiveView('consultations')}
              />
            ) : (
              renderActiveView()
            )}
          </MobileShell>
        </Suspense>
        {isPatientModalOpen && (
          <Suspense fallback={null}>
            <PatientSelectModal
              patients={patients}
              onSelect={handleSelectPatientForNewConsultation}
              onAdd={handleAddPatient}
              onClose={() => setIsPatientModalOpen(false)}
            />
          </Suspense>
        )}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col md:flex-row overflow-hidden">
      {/* SIDEBAR NAVIGATION */}
      {!activeConsultation && (
        <Sidebar
          activeView={activeView}
          onNavigate={(v) => setActiveView(v as ViewState)}
          onExitToHub={onExitToHub}
          doctorName={doctorName}
          canView={canView}
        />
      )}

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col relative overflow-hidden min-w-0">

        {/* MOBILE HEADER OR ACTIVE CONSULTATION HEADER
            - No active consultation: mobile-only header (desktop uses the sidebar).
            - Active consultation: unchanged — shown on md+ only, as before.
            Visibility is controlled purely with CSS so it reacts to viewport resizes. */}
        <header className={`bg-white border-b border-slate-200 z-30 flex-shrink-0 relative ${activeConsultation ? 'hidden md:flex' : 'flex md:hidden'}`}>
          <div className="w-full px-4 sm:px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {!activeConsultation && (
                <button
                  onClick={() => setIsMobileMenuOpen(o => !o)}
                  className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  aria-label="Toggle navigation menu"
                  aria-expanded={isMobileMenuOpen}
                >
                  {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
                </button>
              )}
              <Logo onClick={() => setActiveConsultation(null)} />
            </div>

            {!activeConsultation && (
              <div className="flex items-center gap-4 text-sm font-semibold">
                <div className="w-8 h-8 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center text-slate-600 overflow-hidden">
                  <img src="https://images.unsplash.com/photo-1594824813573-246434de83fb?auto=format&fit=crop&q=80&w=64" alt="Doctor" width={32} height={32} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                </div>
                <span className="text-slate-700 hidden sm:inline-block">Dr. E. Martinez</span>
              </div>
            )}
          </div>

          {/* Mobile dropdown navigation */}
          {!activeConsultation && isMobileMenuOpen && (
            <>
              <div className="fixed inset-0 top-16 z-20 bg-slate-900/20" onClick={() => setIsMobileMenuOpen(false)} />
              <nav className="absolute top-full left-0 right-0 z-30 bg-white border-b border-slate-200 shadow-lg py-2">
                {mobileNavItems.map(item => {
                  const isActive = activeView === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveView(item.id);
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full text-left px-6 py-3 font-medium transition-colors ${
                        isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </nav>
            </>
          )}
        </header>

        {/* MODALS */}
        {isPatientModalOpen && (
          <Suspense fallback={null}>
            <PatientSelectModal
              patients={patients}
              onSelect={handleSelectPatientForNewConsultation}
              onAdd={handleAddPatient}
              onClose={() => setIsPatientModalOpen(false)}
            />
          </Suspense>
        )}

        {/* WORKSPACE / VIEWS */}
        <main className="flex-1 flex flex-col relative overflow-hidden">
          {!activeConsultation ? (
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-6xl mx-auto h-full">
                {/* Back to the platform hub (All Apps) — on every panel. */}
                {onExitToHub && (
                  <div className="px-4 sm:px-6 lg:px-8 pt-4">
                    <button
                      onClick={onExitToHub}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-slate-200 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 transition-colors cursor-pointer"
                    >
                      <ArrowLeft size={16} /> Back
                    </button>
                  </div>
                )}
                {/* Suspense covers the lazily-loaded views (patients / lists /
                    modal). The dashboard is eager, so it paints immediately. */}
                <Suspense fallback={<Loading />}>
                  {loading && activeView === 'dashboard' ? <Loading /> : renderActiveView()}
                </Suspense>
              </div>
            </div>
          ) : (
            <Suspense fallback={<Loading />}>
              <ConsultationWorkspace
                // Remount when the active session changes so the workspace
                // reinitialises from the selected session (transcript, report,
                // audio, status).
                key={activeConsultation.id}
                consultation={activeConsultation}
                patientHistory={consultations.filter(c => c.patientId === activeConsultation.patientId)}
                onFinish={handleFinishConsultation}
                onSaveReport={handleSaveReport}
                onExit={() => setActiveConsultation(null)}
                onNewSession={handleNewSession}
                onSelectSession={handleSelectExistingConsultation}
                onSessionUpdate={handleSessionUpdate}
              />
            </Suspense>
          )}
        </main>
      </div>
    </div>
  );
}
