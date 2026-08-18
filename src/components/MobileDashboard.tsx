import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Home, Calendar as CalendarIcon, Users, MoreHorizontal, Bell, Check, X, Plus,
  Clock, Phone, Search, LogOut, Loader2, CheckCircle2, CalendarClock, ChevronRight, ChevronLeft,
  Stethoscope, Settings, CreditCard, Key, LayoutGrid, MessageCircle, BarChart3, ListOrdered,
} from 'lucide-react';

import { getAppointments, patchAppointment, completeAppointment, type ApiAppointment } from '../api/appointments';
import { getPatients, type ApiPatient } from '../api/patients';
import { getNotifications, type ApiNotification } from '../api/notifications';
import { getWaitlist } from '../api/waitlist';
import { getChannelStatus } from '../api/whatsapp';
import ConnectWhatsApp from './ConnectWhatsApp';
import PatientRegistrationQR from './PatientRegistrationQR';
import AddPatientSheet from './AddPatientSheet';
import PatientRecordModal from './PatientRecordModal';

// ─────────────────────────────────────────────────────────────────────────────
// A phone-first ClinicBook dashboard for the mobile app (and mobile browsers via
// ?mobile=1). The desktop ClinicDashboard is a wide sidebar + tables that read
// poorly on a phone; this is a native-style bottom-nav experience over the SAME
// backend — it fetches its own data and drives the same appointment actions.
//
// Built to the approved green mockup. Every number, pill and label on screen is
// derived from data the API already returns; where the mockup showed something
// the system does not record (a "Checked In" state, an appointment type, patient
// photos) the nearest TRUE thing is shown instead. A clinic desk acts on what it
// reads here, so a plausible-looking invention is worse than a plainer fact.
//
// No function changed: the actions are the same confirm / cancel / complete, and
// deep or admin screens (billing, developer keys) still open the full dashboard.
// ─────────────────────────────────────────────────────────────────────────────

type Tab = 'home' | 'appointments' | 'patients' | 'calendar' | 'reports' | 'whatsapp' | 'more';

interface Props {
  clinicName?: string;
  userName?: string;
  /** Needed for the patient self-registration link/QR. */
  clinicId?: string;
  onLogout: () => void;
  // Opens the full dashboard (all web features: Doctors, Waitlist, Bot Settings,
  // Developers, Billing) — reuses the complete ClinicDashboard.
  onOpenFull?: () => void;
}

const todayKey = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dayKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const S = (s: string) => (s || '').toUpperCase();
const isPending = (s: string) => S(s) === 'PENDING';
const isConfirmed = (s: string) => S(s) === 'CONFIRMED';
const isDone = (s: string) => S(s) === 'COMPLETED';
const isNoShow = (s: string) => S(s) === 'NO_SHOW';
const isCancelled = (s: string) => ['CANCELLED', 'CANCELED', 'NO_SHOW'].includes(S(s));

const initials = (name?: string) =>
  (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';

/**
 * "09:45 AM" → minutes since midnight, or null when it isn't a time we can read.
 * Null matters: a slot we can't place must not count as midnight, which would
 * make every unparseable appointment look overdue.
 */
const minutesOfDay = (time?: string): number | null => {
  const m = (time || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const ap = m[3]?.toUpperCase();
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return h > 23 || min > 59 ? null : h * 60 + min;
};

const relativeIn = (mins: number): string => {
  if (mins <= 0) return 'Now';
  if (mins < 60) return `in ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `in ${h}h ${m}m` : `in ${h}h`;
};

const byTime = (a: ApiAppointment, b: ApiAppointment) =>
  (minutesOfDay(a.appointmentTime) ?? 1e9) - (minutesOfDay(b.appointmentTime) ?? 1e9);

/**
 * The pill on an appointment row.
 *
 * The mockup showed "Checked In" — arrival is not recorded anywhere in this
 * system, so it is not shown. What IS true: where the slot sits against the
 * clock, and how the desk has actioned it.
 */
const apptPill = (a: ApiAppointment, isToday: boolean, nowMins: number): { text: string; cls: string } => {
  if (isDone(a.status)) return { text: 'Completed', cls: 'bg-slate-100 text-slate-500' };
  if (isNoShow(a.status)) return { text: 'No show', cls: 'bg-rose-50 text-rose-600' };
  if (isCancelled(a.status)) return { text: 'Cancelled', cls: 'bg-rose-50 text-rose-600' };
  const m = minutesOfDay(a.appointmentTime);
  if (isToday && m !== null) {
    const d = m - nowMins;
    if (d <= 0 && d > -60) return { text: 'Now', cls: 'bg-emerald-50 text-emerald-700' };
    if (d > 0 && d <= 60) return { text: relativeIn(d), cls: 'bg-violet-50 text-violet-700' };
  }
  if (isConfirmed(a.status)) return { text: 'Confirmed', cls: 'bg-emerald-50 text-emerald-700' };
  return { text: 'Pending', cls: 'bg-amber-50 text-amber-700' };
};

export default function MobileDashboard({ clinicName, userName, clinicId, onLogout, onOpenFull }: Props) {
  const [tab, setTab] = useState<Tab>('home');
  const [appointments, setAppointments] = useState<ApiAppointment[]>([]);
  const [patients, setPatients] = useState<ApiPatient[]>([]);
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [waitlistCount, setWaitlistCount] = useState(0);
  const [waConnected, setWaConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Which patient's full record is open. The same modal the web dashboard uses,
  // so "View Record" means the same thing on both.
  const [recordFor, setRecordFor] = useState<string | null>(null);

  // Paint the PAGE and fill the dynamic viewport. body is #f8fafc for the web, so
  // whatever the app does not cover shows as a band of browser-white under the
  // tab bar — the single thing that most made this read as a web page in a
  // frame rather than an app. Reverted on unmount; the browser is untouched.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('cb-phone-page');
    return () => root.classList.remove('cb-phone-page');
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const [appts, pats, notifs, wait] = await Promise.allSettled([
      getAppointments(), getPatients(), getNotifications(), getWaitlist('WAITING')
    ]);

    // A failed load used to be indistinguishable from an empty clinic: the list
    // stayed blank and said "No patients here." Whatever went wrong — expired
    // session, no signal — the app claimed the clinic had no patients, which is
    // the one thing it must never say when it does not know.
    const failed = [appts, pats, notifs].filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    setLoadError(
      failed.length
        ? (failed[0].reason instanceof Error ? failed[0].reason.message : 'Could not load your clinic data.')
        : null
    );

    if (appts.status === 'fulfilled') setAppointments(appts.value);
    if (pats.status === 'fulfilled') setPatients(pats.value);
    if (notifs.status === 'fulfilled') setNotifications(notifs.value);
    // A waitlist the clinic doesn't use (or an endpoint that fails) shows 0
    // rather than blanking the whole overview card.
    if (wait.status === 'fulfilled') setWaitlistCount(wait.value.length);
    getChannelStatus()
      .then((s) => setWaConnected(Boolean(s.channel && s.channel.status === 'ACTIVE' && s.healthy !== false)))
      .catch(() => setWaConnected(false));
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Reload when the app comes back to the foreground.
  //
  // A patient who self-registers by scanning the QR lands in the database, not
  // in this already-rendered list — so the app showed a stale list until it was
  // force-closed and reopened, which reads as "the registration did not work".
  // A phone app is expected to be current when you look at it.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const today = todayKey();
  const todays = useMemo(
    () => appointments.filter((a) => (a.appointmentDate || '').slice(0, 10) === today).sort(byTime),
    [appointments, today]
  );
  const pendingCount = useMemo(() => appointments.filter((a) => isPending(a.status)).length, [appointments]);
  const noShowCount = useMemo(
    () => appointments.filter((a) => isNoShow(a.status) && (a.appointmentDate || '').slice(0, 10) === today).length,
    [appointments, today]
  );
  const unread = notifications.filter((n) => !n.read).length;

  const act = async (id: string, fn: () => Promise<ApiAppointment>) => {
    setBusyId(id);
    try {
      const updated = await fn();
      setAppointments((list) => list.map((a) => (a.id === id ? { ...a, ...updated } : a)));
    } catch {
      /* surfaced via re-fetch on next load; keep the UI responsive */
    } finally {
      setBusyId(null);
    }
  };
  const confirm = (id: string) => act(id, () => patchAppointment(id, 'CONFIRMED'));
  const cancel = (id: string) => act(id, () => patchAppointment(id, 'CANCELLED'));
  const complete = (id: string) => act(id, () => completeAppointment(id));

  const actions = { busyId, onConfirm: confirm, onCancel: cancel, onComplete: complete };

  return (
    <div className="min-h-[100dvh] bg-[#F6F8FA] font-sans text-slate-900 flex flex-col">
      <header className="sticky top-0 pt-3 z-30 bg-[#F6F8FA]/95 backdrop-blur px-4 pb-3 flex items-center justify-between">
        <button onClick={() => setTab('more')} aria-label="More" className="text-slate-500 p-1 -ml-1">
          <MoreHorizontal className="w-5 h-5 rotate-90" />
        </button>
        <div className="text-[17px] font-bold tracking-tight">
          <span className="text-slate-900">Clinic</span>
          <span className="text-emerald-600">Book</span>
          <span className="text-slate-900"> AI</span>
        </div>
        <button aria-label="Notifications" className="relative text-slate-500 p-1 -mr-1">
          <Bell className="w-5 h-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      </header>

      <main className="flex-1 overflow-y-auto" style={{ paddingBottom: 'calc(76px + min(env(safe-area-inset-bottom), 12px))' }}>
        {loading ? (
          <div className="flex items-center justify-center py-24 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <>
            {/* Say what went wrong, and offer the one action that fixes most of
                it. Silence here is what made a failed load look like an empty
                clinic. */}
            {loadError && (
              <div className="mx-4 mt-4 flex items-start gap-2.5 px-4 py-3 bg-rose-50 border border-rose-200 rounded-2xl">
                <div className="flex-1 min-w-0 text-[13px] text-rose-800 leading-snug">{loadError}</div>
                <button
                  onClick={() => void load()}
                  className="shrink-0 text-[12.5px] font-bold text-rose-700 active:text-rose-900"
                >
                  Retry
                </button>
              </div>
            )}

            {tab === 'home' && (
              <HomeTab
                clinicName={clinicName}
                userName={userName}
                todays={todays}
                pendingCount={pendingCount}
                waitlistCount={waitlistCount}
                noShowCount={noShowCount}
                waConnected={waConnected}
                {...actions}
                go={setTab}
              />
            )}
            {tab === 'appointments' && <AppointmentsTab appointments={appointments} {...actions} />}
            {tab === 'patients' && (
              <PatientsTab
                onOpenRecord={setRecordFor}
                patients={patients}
                appointments={appointments}
                search={search}
                setSearch={setSearch}
                clinicId={clinicId}
              />
            )}
            {tab === 'calendar' && <CalendarTab appointments={appointments} />}
            {tab === 'reports' && <ReportsTab appointments={appointments} patients={patients} />}
            {tab === 'whatsapp' && (
              <div className="px-4 space-y-4 pt-4">
                <ScreenTitle>WhatsApp Booking</ScreenTitle>
                <ConnectWhatsApp compact />
              </div>
            )}
            {tab === 'more' && (
              <MoreTab
                clinicName={clinicName}
                userName={userName}
                onLogout={onLogout}
                onOpenFull={onOpenFull}
                go={setTab}
              />
            )}
          </>
        )}
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 shadow-[0_-4px_20px_rgba(15,23,42,0.07)]">
        <div className="relative flex items-stretch px-1 pt-2 pb-[max(env(safe-area-inset-bottom),10px)]">
          <NavTab id="home" label="Dashboard" Icon={Home} tab={tab} setTab={setTab} />
          <NavTab id="appointments" label="Appointments" Icon={CalendarIcon} tab={tab} setTab={setTab} />
          <div className="w-16 shrink-0" aria-hidden />
          <NavTab id="patients" label="Patients" Icon={Users} tab={tab} setTab={setTab} />
          <NavTab id="more" label="More" Icon={MoreHorizontal} tab={tab} setTab={setTab} />

          {/* Adds a patient right here. It used to bounce to the full dashboard,
              which meant a walk-in at the counter could not be registered from
              the phone at all — the one thing a desk does most. */}
          <button
            onClick={() => setAddOpen(true)}
            aria-label="Add patient"
            className="absolute left-1/2 -translate-x-1/2 -top-6 w-[58px] h-[58px] rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-600/40 ring-4 ring-white active:scale-95 transition-transform"
          >
            <Plus className="w-6 h-6" strokeWidth={2.6} />
          </button>
        </div>
      </nav>

      {addOpen && (
        <AddPatientSheet
          existing={patients}
          onClose={() => setAddOpen(false)}
          onAdded={(p) => {
            // Show them immediately rather than waiting for the next refresh —
            // the desk has the patient in front of them.
            setPatients((list) => [p, ...list]);
            setTab('patients');
          }}
        />
      )}

      {/* The SAME record view the web dashboard opens, so "View Record" means
          one thing across both. */}
      {recordFor && <PatientRecordModal patientId={recordFor} onClose={() => setRecordFor(null)} />}
    </div>
  );
}

const NavTab = ({
  id, label, Icon, tab, setTab,
}: {
  id: Tab; label: string; Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  tab: Tab; setTab: (t: Tab) => void;
}) => {
  const on = tab === id;
  return (
    <button
      onClick={() => setTab(id)}
      aria-current={on ? 'page' : undefined}
      className={`flex-1 flex flex-col items-center gap-1 py-1 transition-colors ${on ? 'text-emerald-600' : 'text-slate-400'}`}
    >
      <Icon className="w-[21px] h-[21px]" strokeWidth={on ? 2.5 : 2} />
      <span className="text-[10px] font-semibold tracking-tight">{label}</span>
    </button>
  );
};

// ── shared bits ──────────────────────────────────────────────────────────────

const ScreenTitle = ({ children }: { children: React.ReactNode }) => (
  <h1 className="text-[22px] font-bold tracking-tight text-slate-900">{children}</h1>
);

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${className}`}>{children}</div>
);

const Avatar = ({ name, tone = 'emerald' }: { name?: string; tone?: 'emerald' | 'slate' }) => (
  <span
    className={`w-10 h-10 rounded-full font-bold flex items-center justify-center shrink-0 text-[13px] ${
      tone === 'emerald' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
    }`}
  >
    {initials(name)}
  </span>
);

const EmptyState = ({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) => (
  <Card className="p-10 text-center">
    <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
      <Icon className="w-6 h-6" />
    </div>
    <p className="text-[14px] text-slate-500">{text}</p>
  </Card>
);

function prettyDate(key: string): string {
  if (key === todayKey()) return 'Today';
  const d = new Date(key + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return key;
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

const longDate = (key: string) => {
  const d = new Date(key + 'T00:00:00');
  return Number.isNaN(d.getTime())
    ? key
    : d.toLocaleDateString(undefined, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
};

// ── appointment row + actions ────────────────────────────────────────────────

interface ActionProps {
  busyId: string | null;
  onConfirm: (id: string) => void;
  onCancel: (id: string) => void;
  onComplete: (id: string) => void;
}

const ApptRow: React.FC<ActionProps & { a: ApiAppointment; isToday: boolean; nowMins: number }> = ({
  a, isToday, nowMins, busyId, onConfirm, onCancel, onComplete,
}) => {
  const [open, setOpen] = useState(false);
  const pill = apptPill(a, isToday, nowMins);
  const busy = busyId === a.id;
  const settled = isDone(a.status) || isCancelled(a.status);

  return (
    <div className="border-t border-slate-100 first:border-t-0">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-3 p-4 text-left active:bg-emerald-50/50 transition-colors">
        <div className="w-[52px] shrink-0">
          <div className="text-[13px] font-bold text-slate-900 leading-4">
            {(a.appointmentTime || '').replace(/\s*(AM|PM)$/i, '')}
          </div>
          <div className="text-[10.5px] font-semibold text-slate-400 uppercase">
            {(a.appointmentTime || '').match(/(AM|PM)$/i)?.[0] ?? ''}
          </div>
        </div>
        <Avatar name={a.patient?.name} />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-slate-900 text-[14.5px] truncate">{a.patient?.name || 'Patient'}</div>
          <div className="text-[12px] text-slate-400 truncate">{a.patient?.phone || a.doctor?.name || ''}</div>
        </div>
        <span className={`shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-lg ${pill.cls}`}>{pill.text}</span>
        <ChevronRight className={`w-4 h-4 text-slate-300 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 -mt-1">
          <div className="rounded-xl bg-slate-50 p-3 space-y-1.5 mb-3">
            <Detail icon={Stethoscope} label="Doctor" value={a.doctor?.name || '—'} />
            {a.doctor?.speciality && <Detail icon={LayoutGrid} label="Speciality" value={a.doctor.speciality} />}
            <Detail icon={CalendarClock} label="Date" value={`${prettyDate((a.appointmentDate || '').slice(0, 10))} · ${a.appointmentTime}`} />
          </div>

          {a.patient?.phone && (
            <div className="flex gap-2 mb-3">
              <a href={`tel:${a.patient.phone}`} className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-[13px] font-bold active:bg-slate-200 transition-colors">
                <Phone className="w-4 h-4" /> Call
              </a>
              <a
                href={`https://wa.me/${(a.patient.phone || '').replace(/\D/g, '')}`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-50 text-emerald-700 text-[13px] font-bold active:bg-emerald-100 transition-colors"
              >
                <MessageCircle className="w-4 h-4" /> WhatsApp
              </a>
            </div>
          )}

          {!settled && (
            <div className="flex gap-2">
              {isPending(a.status) && (
                <button
                  onClick={() => onConfirm(a.id)} disabled={busy}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-600 text-white text-[13px] font-bold disabled:opacity-60 active:bg-emerald-700 transition-colors"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Confirm
                </button>
              )}
              {isConfirmed(a.status) && (
                <button
                  onClick={() => onComplete(a.id)} disabled={busy}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-900 text-white text-[13px] font-bold disabled:opacity-60 active:bg-slate-800 transition-colors"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Mark completed
                </button>
              )}
              <button
                onClick={() => onCancel(a.id)} disabled={busy}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-rose-50 text-rose-600 text-[13px] font-bold disabled:opacity-60 active:bg-rose-100 transition-colors"
              >
                <X className="w-4 h-4" /> Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const Detail = ({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) => (
  <div className="flex items-center gap-2.5">
    <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
    <span className="text-[12px] text-slate-400 w-[70px] shrink-0">{label}</span>
    <span className="text-[12.5px] font-semibold text-slate-700 truncate">{value}</span>
  </div>
);

// ── Dashboard ────────────────────────────────────────────────────────────────

function HomeTab({
  clinicName, userName, todays, pendingCount, waitlistCount, noShowCount, waConnected,
  busyId, onConfirm, onCancel, onComplete, go,
}: ActionProps & {
  clinicName?: string; userName?: string; todays: ApiAppointment[];
  pendingCount: number; waitlistCount: number; noShowCount: number; waConnected: boolean | null;
  go: (t: Tab) => void;
}) {
  const now = new Date();
  const hour = now.getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const nowMins = hour * 60 + now.getMinutes();

  const next = todays.find((a) => {
    if (isDone(a.status) || isCancelled(a.status)) return false;
    const m = minutesOfDay(a.appointmentTime);
    return m !== null && m >= nowMins;
  });
  const nextIn = next ? (minutesOfDay(next.appointmentTime) ?? 0) - nowMins : null;

  const stats = [
    { value: todays.length, label: 'Appointments', tone: 'text-emerald-600', bg: 'bg-emerald-50', to: 'appointments' as Tab },
    { value: pendingCount, label: 'Pending', tone: 'text-amber-600', bg: 'bg-amber-50', to: 'appointments' as Tab },
    { value: waitlistCount, label: 'Waitlist', tone: 'text-sky-600', bg: 'bg-sky-50', to: 'more' as Tab },
    { value: noShowCount, label: 'No shows', tone: 'text-rose-500', bg: 'bg-rose-50', to: 'reports' as Tab },
  ];

  const tiles = [
    { Icon: CalendarIcon, label: 'Appointments', to: 'appointments' as Tab },
    { Icon: Users, label: 'Patients', to: 'patients' as Tab },
    { Icon: CalendarClock, label: 'Calendar', to: 'calendar' as Tab },
    { Icon: ListOrdered, label: 'Waitlist', to: 'more' as Tab },
    { Icon: MessageCircle, label: 'WhatsApp', to: 'whatsapp' as Tab },
    { Icon: BarChart3, label: 'Reports', to: 'reports' as Tab },
  ];

  return (
    <div className="px-4 pt-4 space-y-4">
      {/* Greeting — wraps rather than truncates, so a long name keeps its
          second half instead of losing it to an ellipsis. */}
      <Card className="p-4">
        <h1 className="text-[19px] font-bold text-slate-900 tracking-tight leading-6 break-words">
          {greet}{userName ? `, ${userName}` : ''} <span className="align-middle">👋</span>
        </h1>
        <p className="text-slate-400 text-[13.5px] mt-1">{clinicName || 'Your clinic'}</p>
      </Card>

      {/* Today's overview */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3.5">
          <span className="font-bold text-slate-900 text-[15px]">Today's Overview</span>
          <span className="text-[11.5px] text-slate-400">
            {now.toLocaleDateString(undefined, { day: '2-digit', month: 'long', year: 'numeric' })}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {stats.map((s) => (
            <button key={s.label} onClick={() => go(s.to)} className={`rounded-xl ${s.bg} py-3 active:opacity-80 transition-opacity`}>
              <div className={`text-[22px] font-bold leading-6 ${s.tone}`}>{s.value}</div>
              <div className="text-[10.5px] font-medium text-slate-500 mt-0.5">{s.label}</div>
            </button>
          ))}
        </div>
      </Card>

      {/* Next appointment */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="font-bold text-slate-900 text-[15px]">Next Appointment</span>
          {next && (
            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg">
              {nextIn !== null && nextIn <= 0 ? 'Now' : relativeIn(nextIn ?? 0)}
            </span>
          )}
        </div>
        {next ? (
          <div className="flex items-center gap-3">
            <Avatar name={next.patient?.name} />
            <div className="flex-1 min-w-0">
              <div className="font-bold text-slate-900 text-[15px] truncate">{next.patient?.name || 'Patient'}</div>
              <div className="text-[12.5px] text-slate-400 truncate">
                {next.appointmentTime}{next.doctor?.name ? ` · ${next.doctor.name}` : ''}
              </div>
            </div>
            {isPending(next.status) ? (
              <button
                onClick={() => onConfirm(next.id)}
                disabled={busyId === next.id}
                className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-[13px] font-bold disabled:opacity-60 active:bg-emerald-700 transition-colors"
              >
                {busyId === next.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Confirm
              </button>
            ) : (
              <button
                onClick={() => onComplete(next.id)}
                disabled={busyId === next.id}
                className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-[13px] font-bold disabled:opacity-60 active:bg-slate-800 transition-colors"
              >
                {busyId === next.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Complete
              </button>
            )}
          </div>
        ) : (
          <p className="text-[13px] text-slate-400">
            {todays.length ? 'All of today’s appointments are done.' : 'Nothing booked for today.'}
          </p>
        )}
      </Card>

      {/* Six things the desk does */}
      <div className="grid grid-cols-3 gap-3">
        {tiles.map(({ Icon, label, to }) => (
          <button
            key={label}
            onClick={() => go(to)}
            className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col items-center gap-2.5 active:scale-[0.98] transition-transform"
          >
            <span className="w-11 h-11 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Icon className="w-5 h-5" />
            </span>
            <span className="text-[11.5px] font-semibold text-slate-700 text-center leading-tight">{label}</span>
          </button>
        ))}
      </div>

      {/* WhatsApp is how bookings arrive — say plainly when it isn't connected. */}
      {waConnected === false && (
        <button onClick={() => go('whatsapp')} className="w-full text-left">
          <Card className="p-4 flex items-center gap-3 border-amber-200 bg-amber-50">
            <span className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <MessageCircle className="w-5 h-5" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-amber-900 text-[14px]">WhatsApp isn’t connected</div>
              <div className="text-[12px] text-amber-800 leading-snug">Patients can’t book on WhatsApp until it is.</div>
            </div>
            <ChevronRight className="w-4 h-4 text-amber-600 shrink-0" />
          </Card>
        </button>
      )}

      {/* Today's schedule */}
      <div className="flex items-center justify-between pt-1">
        <h2 className="text-[15px] font-bold text-slate-800">Today's schedule</h2>
        <button onClick={() => go('appointments')} className="text-[13px] font-semibold text-emerald-600">See all</button>
      </div>
      {todays.length === 0 ? (
        <EmptyState icon={CalendarClock} text="No appointments today yet." />
      ) : (
        <Card className="overflow-hidden">
          {todays.map((a) => (
            <ApptRow
              key={a.id} a={a} isToday nowMins={nowMins}
              busyId={busyId} onConfirm={onConfirm} onCancel={onCancel} onComplete={onComplete}
            />
          ))}
        </Card>
      )}
    </div>
  );
}

// ── Appointments ─────────────────────────────────────────────────────────────

function AppointmentsTab({ appointments, busyId, onConfirm, onCancel, onComplete }: ActionProps & { appointments: ApiAppointment[] }) {
  const now = new Date();
  const [selected, setSelected] = useState<string>(todayKey());
  const nowMins = now.getHours() * 60 + now.getMinutes();

  // Today plus the next six days — the window a desk plans within.
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; }),
    []
  );

  const onDay = useMemo(
    () => appointments.filter((a) => (a.appointmentDate || '').slice(0, 10) === selected).sort(byTime),
    [appointments, selected]
  );

  return (
    <div className="pt-4">
      <div className="px-4 mb-4"><ScreenTitle>Appointments</ScreenTitle></div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 pb-4">
        {days.map((d) => {
          const key = dayKey(d);
          const active = key === selected;
          const count = appointments.filter((a) => (a.appointmentDate || '').slice(0, 10) === key).length;
          return (
            <button
              key={key}
              onClick={() => setSelected(key)}
              className={`shrink-0 w-[52px] py-2.5 rounded-2xl flex flex-col items-center gap-0.5 transition-colors ${
                active ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30' : 'bg-white border border-slate-200 text-slate-500'
              }`}
            >
              <span className={`text-[11px] font-semibold ${active ? 'text-white/80' : 'text-slate-400'}`}>
                {d.toLocaleDateString(undefined, { weekday: 'short' })}
              </span>
              <span className="text-[17px] font-bold leading-5">{d.getDate()}</span>
              <span className={`w-1.5 h-1.5 rounded-full ${count ? (active ? 'bg-white' : 'bg-emerald-400') : 'bg-transparent'}`} />
            </button>
          );
        })}
      </div>

      <div className="px-4">
        <p className="text-[12.5px] font-semibold text-slate-400 mb-3">{longDate(selected)}</p>
        {onDay.length === 0 ? (
          <EmptyState icon={CalendarClock} text="Nothing booked on this day." />
        ) : (
          <Card className="overflow-hidden">
            {onDay.map((a) => (
              <ApptRow
                key={a.id} a={a} isToday={selected === todayKey()} nowMins={nowMins}
                busyId={busyId} onConfirm={onConfirm} onCancel={onCancel} onComplete={onComplete}
              />
            ))}
          </Card>
        )}
        <p className="text-[12px] text-slate-400 text-center mt-4">Tap a patient for details and actions</p>
      </div>
    </div>
  );
}

// ── Patients ─────────────────────────────────────────────────────────────────

type PatientFilter = 'all' | 'new' | 'followup' | 'inactive';
const INACTIVE_DAYS = 90;

function PatientsTab({
  patients, appointments, search, setSearch, clinicId, onOpenRecord,
}: {
  patients: ApiPatient[]; appointments: ApiAppointment[]; search: string; setSearch: (s: string) => void;
  onOpenRecord: (patientId: string) => void;
  clinicId?: string;
}) {
  const [filter, setFilter] = useState<PatientFilter>('all');
  const today = todayKey();

  // Last visit per patient — the most recent appointment that has already
  // happened. Derived, because the API does not carry it.
  const lastVisit = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of appointments) {
      const d = (a.appointmentDate || '').slice(0, 10);
      if (!d || d > today || isCancelled(a.status)) continue;
      const cur = m.get(a.patientId);
      if (!cur || d > cur) m.set(a.patientId, d);
    }
    return m;
  }, [appointments, today]);

  const daysSince = (key?: string): number | null => {
    if (!key) return null;
    const d = new Date(key + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return null;
    return Math.floor((Date.now() - d.getTime()) / 86_400_000);
  };

  // Only labels the data can actually support: never visited, visited, or not
  // seen for three months. The mockup's "Follow Up" vs "Consultation" split is a
  // visit TYPE, which nothing in the system records.
  const tagOf = (p: ApiPatient): { text: string; cls: string } => {
    const since = daysSince(lastVisit.get(p.id));
    if (since === null) return { text: 'New', cls: 'bg-sky-50 text-sky-700' };
    if (since > INACTIVE_DAYS) return { text: 'Inactive', cls: 'bg-slate-100 text-slate-500' };
    return { text: 'Returning', cls: 'bg-emerald-50 text-emerald-700' };
  };

  const q = search.trim().toLowerCase();
  const shown = useMemo(() => {
    return patients.filter((p) => {
      if (q && !(p.name.toLowerCase().includes(q) || (p.phone || '').includes(q))) return false;
      const since = daysSince(lastVisit.get(p.id));
      if (filter === 'new') return since === null;
      if (filter === 'followup') return since !== null && since <= INACTIVE_DAYS;
      if (filter === 'inactive') return since !== null && since > INACTIVE_DAYS;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patients, q, filter, lastVisit]);

  const chips: { key: PatientFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'new', label: 'New' },
    { key: 'followup', label: 'Returning' },
    { key: 'inactive', label: 'Inactive' },
  ];

  return (
    <div className="px-4 pt-4 space-y-4">
      <ScreenTitle>Patients</ScreenTitle>

      {clinicId && <PatientRegistrationQR clinicId={clinicId} />}

      <div className="relative">
        <Search className="w-[17px] h-[17px] text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or phone…"
          className="w-full bg-white border border-slate-200 rounded-2xl pl-10 pr-4 py-3 text-[14px] placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
        {chips.map((c) => (
          <button
            key={c.key}
            onClick={() => setFilter(c.key)}
            className={`shrink-0 px-4 py-2 rounded-full text-[13px] font-semibold transition-colors ${
              filter === c.key
                ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30'
                : 'bg-white text-slate-500 border border-slate-200'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <p className="text-[12.5px] text-slate-400">
        {q || filter !== 'all' ? `${shown.length} of ${patients.length}` : `${patients.length} registered`}
      </p>

      {shown.length === 0 ? (
        <EmptyState icon={Users} text={q ? 'No matching patients.' : 'No patients here.'} />
      ) : (
        <div className="space-y-2.5">
          {shown.map((p) => {
            const tag = tagOf(p);
            const last = lastVisit.get(p.id);
            return (
              // The same facts the web table shows — age/gender, reason for
              // visit, language — not a reduced version of it. A clinic reading
              // the phone should not have to open a laptop to see why someone
              // came in.
              <Card key={p.id} className="p-4">
                <div className="flex items-start gap-3">
                  <Avatar name={p.name} tone="slate" />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-900 text-[15px] truncate">{p.name}</div>
                    <div className="text-[12.5px] text-slate-400 truncate">{p.phone}</div>
                    <div className="text-[11.5px] text-slate-400 mt-0.5">
                      {[
                        p.age ? `${p.age} yrs` : null,
                        p.gender || null,
                        p.language || null
                      ].filter(Boolean).join(' · ') || 'Details not recorded'}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg ${tag.cls}`}>{tag.text}</span>
                    <a
                      href={`tel:${p.phone}`}
                      aria-label={`Call ${p.name}`}
                      className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center active:bg-emerald-100 transition-colors"
                    >
                      <Phone className="w-4 h-4" />
                    </a>
                  </div>
                </div>

                {p.healthConcern && (
                  <p className="text-[12.5px] text-slate-600 mt-2.5 pt-2.5 border-t border-slate-100">
                    <span className="text-slate-400">Reason for visit: </span>
                    {p.healthConcern}
                  </p>
                )}

                <div className="flex items-center justify-between gap-3 mt-2.5">
                  <span className="text-[11.5px] text-slate-400">
                    {last ? `Last visit: ${prettyDate(last)}` : 'No visit yet'}
                  </span>
                  <button
                    onClick={() => onOpenRecord(p.id)}
                    className="text-[12.5px] font-semibold text-emerald-700 active:text-emerald-800"
                  >
                    View Record
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Calendar ─────────────────────────────────────────────────────────────────

const DAY_START = 8; // 08:00 — the earliest hour the grid shows
const DAY_END = 20; // 20:00
const HOUR_PX = 56;

function CalendarTab({ appointments }: { appointments: ApiAppointment[] }) {
  const [day, setDay] = useState<string>(todayKey());

  const onDay = useMemo(
    () => appointments.filter((a) => (a.appointmentDate || '').slice(0, 10) === day).sort(byTime),
    [appointments, day]
  );

  const shift = (delta: number) => {
    const d = new Date(day + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    setDay(dayKey(d));
  };

  const hours = Array.from({ length: DAY_END - DAY_START + 1 }, (_, i) => DAY_START + i);
  const label12 = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h >= 12 ? 'PM' : 'AM'}`;

  // Anything outside the visible window would be silently dropped — say so
  // instead, so a 7am or late-evening slot is never invisible.
  const outside = onDay.filter((a) => {
    const m = minutesOfDay(a.appointmentTime);
    return m === null || m < DAY_START * 60 || m > DAY_END * 60;
  });

  return (
    <div className="px-4 pt-4 space-y-4">
      <ScreenTitle>Calendar</ScreenTitle>

      <Card className="p-3 flex items-center justify-between">
        <button onClick={() => shift(-1)} aria-label="Previous day" className="p-2 text-slate-400 active:text-slate-700">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="text-center">
          <div className="text-[14.5px] font-bold text-slate-900">{longDate(day)}</div>
          <div className="text-[11.5px] text-slate-400">{onDay.length} appointment{onDay.length === 1 ? '' : 's'}</div>
        </div>
        <button onClick={() => shift(1)} aria-label="Next day" className="p-2 text-slate-400 active:text-slate-700">
          <ChevronRight className="w-5 h-5" />
        </button>
      </Card>

      <Card className="p-3 overflow-hidden">
        <div className="relative" style={{ height: (DAY_END - DAY_START) * HOUR_PX + 20 }}>
          {hours.map((h, i) => (
            <div key={h} className="absolute left-0 right-0 flex items-start gap-2" style={{ top: i * HOUR_PX }}>
              <span className="w-[46px] shrink-0 text-[10.5px] font-semibold text-slate-400 -mt-1.5">{label12(h)}</span>
              <span className="flex-1 border-t border-slate-100 mt-0" />
            </div>
          ))}

          {onDay.map((a) => {
            const m = minutesOfDay(a.appointmentTime);
            if (m === null || m < DAY_START * 60 || m > DAY_END * 60) return null;
            const top = ((m - DAY_START * 60) / 60) * HOUR_PX;
            const settled = isDone(a.status) || isCancelled(a.status);
            return (
              <div
                key={a.id}
                className={`absolute left-[54px] right-0 rounded-lg px-2.5 py-1.5 border-l-[3px] ${
                  settled
                    ? 'bg-slate-50 border-slate-300'
                    : isConfirmed(a.status)
                      ? 'bg-emerald-50 border-emerald-500'
                      : 'bg-amber-50 border-amber-400'
                }`}
                style={{ top: top + 2, height: HOUR_PX - 8 }}
              >
                <div className={`text-[12.5px] font-bold truncate ${settled ? 'text-slate-400' : 'text-slate-900'}`}>
                  {a.patient?.name || 'Patient'}
                </div>
                <div className="text-[11px] text-slate-400 truncate">
                  {a.appointmentTime}{a.doctor?.name ? ` · ${a.doctor.name}` : ''}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {outside.length > 0 && (
        <p className="text-[12px] text-slate-400 text-center">
          {outside.length} appointment{outside.length === 1 ? '' : 's'} outside {label12(DAY_START)}–{label12(DAY_END)} —
          see the Appointments tab.
        </p>
      )}
    </div>
  );
}

// ── Reports ──────────────────────────────────────────────────────────────────

function ReportsTab({ appointments, patients }: { appointments: ApiAppointment[]; patients: ApiPatient[] }) {
  const [days, setDays] = useState<7 | 30>(7);

  const since = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (days - 1));
    return dayKey(d);
  }, [days]);

  const inRange = useMemo(
    () => appointments.filter((a) => (a.appointmentDate || '').slice(0, 10) >= since),
    [appointments, since]
  );

  const total = inRange.length;
  const completed = inRange.filter((a) => isDone(a.status)).length;
  const noShows = inRange.filter((a) => isNoShow(a.status)).length;
  const cancelled = inRange.filter((a) => isCancelled(a.status) && !isNoShow(a.status)).length;

  // Per-day completed vs no-show across the window — the only trend the data
  // supports without a separate analytics call.
  const series = useMemo(() => {
    const out: { label: string; completed: number; noShow: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const k = dayKey(d);
      const on = appointments.filter((a) => (a.appointmentDate || '').slice(0, 10) === k);
      out.push({
        label: d.toLocaleDateString(undefined, { weekday: 'narrow' }),
        completed: on.filter((a) => isDone(a.status)).length,
        noShow: on.filter((a) => isNoShow(a.status)).length
      });
    }
    return out;
  }, [appointments, days]);

  const peak = Math.max(1, ...series.map((s) => Math.max(s.completed, s.noShow)));

  // Where patients came from — patient.source is recorded at registration
  // ("whatsapp" for a WhatsApp booking), so this is measured, not guessed.
  const sources = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of patients) {
      const raw = (p.source || '').trim().toLowerCase();
      const key = raw === 'whatsapp' ? 'WhatsApp' : raw ? raw[0].toUpperCase() + raw.slice(1) : 'Added by clinic';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const tones = ['bg-emerald-500', 'bg-sky-500', 'bg-violet-500', 'bg-amber-500', 'bg-slate-400'];
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, value], i) => ({ label, value, tone: tones[i] }));
  }, [patients]);

  const cards = [
    { value: total, label: 'Total appts', tone: 'text-slate-900' },
    { value: completed, label: 'Completed', tone: 'text-emerald-600' },
    { value: noShows, label: 'No shows', tone: 'text-rose-500' },
    { value: cancelled, label: 'Cancelled', tone: 'text-amber-600' },
  ];

  return (
    <div className="px-4 pt-4 space-y-4">
      <div className="flex items-center justify-between">
        <ScreenTitle>Reports</ScreenTitle>
        <div className="flex gap-1.5">
          {([7, 30] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-semibold transition-colors ${
                days === d ? 'bg-emerald-600 text-white' : 'bg-white text-slate-500 border border-slate-200'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {cards.map((c) => (
          <Card key={c.label} className="p-4">
            <div className={`text-[26px] font-bold leading-7 ${c.tone}`}>{c.value}</div>
            <div className="text-[12px] font-medium text-slate-400 mt-0.5">{c.label}</div>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <div className="font-bold text-slate-900 text-[15px] mb-1">Completed vs no shows</div>
        <div className="text-[11.5px] text-slate-400 mb-4">Last {days} days</div>
        <div className="flex items-end gap-1.5 h-32">
          {series.map((s, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <div className="w-full flex items-end justify-center gap-0.5 h-28">
                <span
                  className="w-1/2 max-w-[10px] rounded-t bg-emerald-500"
                  style={{ height: `${(s.completed / peak) * 100}%` }}
                  title={`${s.completed} completed`}
                />
                <span
                  className="w-1/2 max-w-[10px] rounded-t bg-rose-400"
                  style={{ height: `${(s.noShow / peak) * 100}%` }}
                  title={`${s.noShow} no shows`}
                />
              </div>
              <span className="text-[9.5px] text-slate-400 truncate">{s.label}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 mt-3 text-[11.5px] text-slate-500">
          <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Completed</span>
          <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full bg-rose-400" /> No shows</span>
        </div>
      </Card>

      <Card className="p-4">
        <div className="font-bold text-slate-900 text-[15px] mb-1">Where patients come from</div>
        <div className="text-[11.5px] text-slate-400 mb-4">{patients.length} registered</div>
        {sources.length === 0 ? (
          <p className="text-[13px] text-slate-400">No patients yet.</p>
        ) : (
          <div className="space-y-2.5">
            {sources.map((s) => (
              <div key={s.label}>
                <div className="flex items-center justify-between text-[12.5px] mb-1">
                  <span className="text-slate-600 font-medium truncate">{s.label}</span>
                  <span className="text-slate-400 shrink-0 ml-2">
                    {s.value} · {Math.round((s.value / patients.length) * 100)}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className={`h-full rounded-full ${s.tone}`} style={{ width: `${(s.value / patients.length) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ── More ─────────────────────────────────────────────────────────────────────

function MoreTab({
  clinicName, userName, onLogout, onOpenFull, go,
}: {
  clinicName?: string; userName?: string; onLogout: () => void; onOpenFull?: () => void; go: (t: Tab) => void;
}) {
  const shortcuts: { Icon: React.ComponentType<{ className?: string }>; label: string; to: Tab }[] = [
    { Icon: CalendarClock, label: 'Calendar', to: 'calendar' },
    { Icon: BarChart3, label: 'Reports', to: 'reports' },
    { Icon: MessageCircle, label: 'WhatsApp Booking', to: 'whatsapp' },
  ];
  const onWeb = [
    { Icon: Stethoscope, label: 'Doctors & Schedules' },
    { Icon: ListOrdered, label: 'Waitlist' },
    { Icon: Settings, label: 'Bot Settings' },
    { Icon: Key, label: 'Developers & API' },
    { Icon: CreditCard, label: 'Subscription Billing' },
  ];

  return (
    <div className="px-4 pt-4 space-y-4">
      <ScreenTitle>More</ScreenTitle>

      <div className="rounded-2xl p-5 bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-600/25">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-white/20 border border-white/30 text-white flex items-center justify-center font-bold text-[17px] shrink-0">
            {initials(clinicName)}
          </div>
          <div className="min-w-0">
            <div className="text-white font-bold text-[18px] truncate">{clinicName || 'ClinicBook AI'}</div>
            {userName && <div className="text-white/80 text-[13px] truncate mt-0.5">{userName}</div>}
          </div>
        </div>
      </div>

      <Card className="overflow-hidden">
        {shortcuts.map(({ Icon, label, to }, i) => (
          <button
            key={label}
            onClick={() => go(to)}
            className={`w-full flex items-center gap-3.5 p-4 text-left active:bg-slate-50 transition-colors ${i ? 'border-t border-slate-100' : ''}`}
          >
            <span className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <Icon className="w-[18px] h-[18px]" />
            </span>
            <span className="flex-1 font-semibold text-slate-900 text-[14.5px]">{label}</span>
            <ChevronRight className="w-[18px] h-[18px] text-slate-300 shrink-0" />
          </button>
        ))}
      </Card>

      {onOpenFull && (
        <button onClick={onOpenFull} className="w-full text-left">
          <Card className="overflow-hidden active:bg-slate-50 transition-colors">
            <div className="flex items-center gap-3.5 p-4">
              <span className="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                <LayoutGrid className="w-[18px] h-[18px]" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-900 text-[14.5px]">Full dashboard</div>
                <div className="text-[12px] text-slate-400">Everything from the web — same features</div>
              </div>
              <ChevronRight className="w-[18px] h-[18px] text-slate-300 shrink-0" />
            </div>
            <div className="px-4 pb-4 flex flex-wrap gap-x-4 gap-y-1.5">
              {onWeb.map(({ Icon, label }) => (
                <span key={label} className="inline-flex items-center gap-1.5 text-[11.5px] text-slate-500">
                  <Icon className="w-3.5 h-3.5 text-slate-400" /> {label}
                </span>
              ))}
            </div>
          </Card>
        </button>
      )}

      <button
        onClick={onLogout}
        className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-white border border-slate-200 text-rose-600 font-bold text-[14px] shadow-sm active:bg-rose-50 transition-colors"
      >
        <LogOut className="w-[17px] h-[17px]" /> Sign out
      </button>

      <p className="text-center text-[11.5px] text-slate-400 pt-1">ClinicBook AI</p>
    </div>
  );
}
