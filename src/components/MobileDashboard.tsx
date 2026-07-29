import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Home, Calendar, Users, MessageCircle, MoreHorizontal, Bell, Check, X,
  Clock, Phone, Search, LogOut, Loader2, CheckCircle2, CalendarClock, ChevronRight, Stethoscope,
} from 'lucide-react';

import { getAppointments, patchAppointment, completeAppointment, type ApiAppointment } from '../api/appointments';
import { getPatients, type ApiPatient } from '../api/patients';
import { getNotifications, type ApiNotification } from '../api/notifications';
import { getChannelStatus } from '../api/whatsapp';
import ConnectWhatsApp from './ConnectWhatsApp';

// ─────────────────────────────────────────────────────────────────────────────
// A phone-first ClinicBook dashboard for the mobile app (and mobile browsers via
// ?mobile=1). The desktop ClinicDashboard is a wide sidebar + tables that read
// poorly on a phone; this is a native-style bottom-nav experience over the SAME
// backend — it fetches its own data and drives the same appointment actions.
// Deliberately covers the daily-driver surfaces (Home, Appointments, Patients,
// WhatsApp); deep/admin screens (billing, developer keys) stay on the web.
// ─────────────────────────────────────────────────────────────────────────────

type Tab = 'home' | 'appointments' | 'patients' | 'whatsapp' | 'more';

interface Props {
  clinicName?: string;
  userName?: string;
  onLogout: () => void;
}

const todayKey = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const S = (s: string) => (s || '').toUpperCase();
const isPending = (s: string) => S(s) === 'PENDING';
const isConfirmed = (s: string) => S(s) === 'CONFIRMED';
const isDone = (s: string) => S(s) === 'COMPLETED';
const isCancelled = (s: string) => ['CANCELLED', 'CANCELED', 'NO_SHOW'].includes(S(s));

const statusChip = (s: string): { label: string; cls: string } => {
  if (isConfirmed(s)) return { label: 'Confirmed', cls: 'bg-emerald-50 text-emerald-700' };
  if (isDone(s)) return { label: 'Completed', cls: 'bg-slate-100 text-slate-500' };
  if (isCancelled(s)) return { label: 'Cancelled', cls: 'bg-rose-50 text-rose-600' };
  return { label: 'Pending', cls: 'bg-amber-50 text-amber-700' };
};

const initials = (name?: string) =>
  (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';

export default function MobileDashboard({ clinicName, userName, onLogout }: Props) {
  const [tab, setTab] = useState<Tab>('home');
  const [appointments, setAppointments] = useState<ApiAppointment[]>([]);
  const [patients, setPatients] = useState<ApiPatient[]>([]);
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [waConnected, setWaConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [appts, pats, notifs] = await Promise.allSettled([getAppointments(), getPatients(), getNotifications()]);
    if (appts.status === 'fulfilled') setAppointments(appts.value);
    if (pats.status === 'fulfilled') setPatients(pats.value);
    if (notifs.status === 'fulfilled') setNotifications(notifs.value);
    getChannelStatus()
      .then((s) => setWaConnected(Boolean(s.channel && s.channel.status === 'ACTIVE' && s.healthy !== false)))
      .catch(() => setWaConnected(false));
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const today = todayKey();
  const todays = useMemo(
    () => appointments.filter((a) => (a.appointmentDate || '').slice(0, 10) === today),
    [appointments, today]
  );
  const pendingCount = useMemo(() => appointments.filter((a) => isPending(a.status)).length, [appointments]);
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

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-100 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center text-white shrink-0">
            <Calendar className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-extrabold text-slate-900 truncate leading-tight">{clinicName || 'ClinicBook AI'}</div>
            <div className="text-[10px] text-slate-400 leading-tight">Clinic Desk</div>
          </div>
        </div>
        <div className="relative">
          <Bell className="w-5 h-5 text-slate-500" />
          {unread > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-24">
        {loading ? (
          <div className="flex items-center justify-center py-24 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <>
            {tab === 'home' && (
              <HomeTab
                userName={userName}
                todays={todays}
                pendingCount={pendingCount}
                patientCount={patients.length}
                waConnected={waConnected}
                busyId={busyId}
                onConfirm={confirm}
                onCancel={cancel}
                onComplete={complete}
                onSeeAll={() => setTab('appointments')}
                onOpenWhatsApp={() => setTab('whatsapp')}
              />
            )}
            {tab === 'appointments' && (
              <AppointmentsTab
                appointments={appointments}
                busyId={busyId}
                onConfirm={confirm}
                onCancel={cancel}
                onComplete={complete}
              />
            )}
            {tab === 'patients' && (
              <PatientsTab patients={patients} search={search} setSearch={setSearch} />
            )}
            {tab === 'whatsapp' && (
              <div className="p-4 space-y-4">
                <SectionTitle>WhatsApp Booking</SectionTitle>
                <ConnectWhatsApp compact />
              </div>
            )}
            {tab === 'more' && (
              <MoreTab clinicName={clinicName} userName={userName} onLogout={onLogout} />
            )}
          </>
        )}
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 inset-x-0 z-20 bg-white border-t border-slate-100 grid grid-cols-5">
        {([
          { id: 'home', label: 'Home', Icon: Home },
          { id: 'appointments', label: 'Appts', Icon: Calendar },
          { id: 'patients', label: 'Patients', Icon: Users },
          { id: 'whatsapp', label: 'WhatsApp', Icon: MessageCircle },
          { id: 'more', label: 'More', Icon: MoreHorizontal },
        ] as const).map(({ id, label, Icon }) => {
          const on = tab === id;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold transition-colors ${
                on ? 'text-emerald-600' : 'text-slate-400'
              }`}
            >
              <Icon className="w-5 h-5" strokeWidth={on ? 2.4 : 1.8} />
              {label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

// ── shared bits ──────────────────────────────────────────────────────────────

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">{children}</h2>
);

const StatCard = ({ value, label, tone }: { value: React.ReactNode; label: string; tone: string }) => (
  <div className="flex-1 bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
    <div className={`text-2xl font-extrabold ${tone}`}>{value}</div>
    <div className="text-[11px] font-medium text-slate-400 mt-0.5">{label}</div>
  </div>
);

interface ApptCardProps {
  a: ApiAppointment;
  busyId: string | null;
  onConfirm: (id: string) => void;
  onCancel: (id: string) => void;
  onComplete: (id: string) => void;
}

const ApptCard: React.FC<ApptCardProps> = ({ a, busyId, onConfirm, onCancel, onComplete }) => {
  const chip = statusChip(a.status);
  const busy = busyId === a.id;
  const done = isDone(a.status) || isCancelled(a.status);
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-3.5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-700 font-bold flex items-center justify-center shrink-0 text-sm">
          {initials(a.patient?.name)}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="font-bold text-slate-900 text-sm truncate">{a.patient?.name || 'Patient'}</div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${chip.cls}`}>{chip.label}</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-1">
            <Clock className="w-3 h-3" /> {a.appointmentTime}
            <span className="text-slate-300">·</span>
            <Stethoscope className="w-3 h-3" /> {a.doctor?.name || 'Doctor'}
          </div>
        </div>
      </div>
      {!done && (
        <div className="flex gap-2 mt-3">
          {isPending(a.status) && (
            <button
              onClick={() => onConfirm(a.id)} disabled={busy}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold disabled:opacity-60"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Confirm
            </button>
          )}
          {isConfirmed(a.status) && (
            <button
              onClick={() => onComplete(a.id)} disabled={busy}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold disabled:opacity-60"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Complete
            </button>
          )}
          <button
            onClick={() => onCancel(a.id)} disabled={busy}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-rose-50 text-rose-600 text-xs font-bold disabled:opacity-60"
          >
            <X className="w-3.5 h-3.5" /> Cancel
          </button>
        </div>
      )}
    </div>
  );
};

// ── tabs ─────────────────────────────────────────────────────────────────────

function HomeTab({
  userName, todays, pendingCount, patientCount, waConnected, busyId,
  onConfirm, onCancel, onComplete, onSeeAll, onOpenWhatsApp,
}: {
  userName?: string; todays: ApiAppointment[]; pendingCount: number; patientCount: number;
  waConnected: boolean | null; busyId: string | null;
  onConfirm: (id: string) => void; onCancel: (id: string) => void; onComplete: (id: string) => void;
  onSeeAll: () => void; onOpenWhatsApp: () => void;
}) {
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return (
    <div className="p-4 space-y-4">
      <div>
        <div className="text-lg font-extrabold text-slate-900">{greet} 👋</div>
        {userName && <div className="text-sm text-slate-400">{userName}</div>}
      </div>

      <div className="flex gap-3">
        <StatCard value={todays.length} label="Today's appointments" tone="text-emerald-600" />
        <StatCard value={pendingCount} label="Pending confirmation" tone="text-amber-600" />
      </div>
      <div className="flex gap-3">
        <StatCard value={patientCount} label="Clinic patients" tone="text-slate-900" />
        <button onClick={onOpenWhatsApp} className="flex-1 text-left">
          <div className="h-full bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
            <div className={`text-sm font-extrabold ${waConnected ? 'text-emerald-600' : 'text-slate-400'}`}>
              {waConnected == null ? '…' : waConnected ? 'Connected' : 'Not set up'}
            </div>
            <div className="text-[11px] font-medium text-slate-400 mt-0.5 flex items-center gap-1">
              WhatsApp <ChevronRight className="w-3 h-3" />
            </div>
          </div>
        </button>
      </div>

      <div className="flex items-center justify-between pt-1">
        <SectionTitle>Today's appointments</SectionTitle>
        <button onClick={onSeeAll} className="text-xs font-bold text-emerald-600 flex items-center gap-0.5">
          See all <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      {todays.length === 0 ? (
        <EmptyState icon={CalendarClock} text="No appointments today yet." />
      ) : (
        <div className="space-y-2.5">
          {todays.map((a) => (
            <ApptCard key={a.id} a={a} busyId={busyId} onConfirm={onConfirm} onCancel={onCancel} onComplete={onComplete} />
          ))}
        </div>
      )}
    </div>
  );
}

function AppointmentsTab({
  appointments, busyId, onConfirm, onCancel, onComplete,
}: {
  appointments: ApiAppointment[]; busyId: string | null;
  onConfirm: (id: string) => void; onCancel: (id: string) => void; onComplete: (id: string) => void;
}) {
  const [filter, setFilter] = useState<'upcoming' | 'all'>('upcoming');
  const today = todayKey();
  const shown = useMemo(() => {
    const list = [...appointments].sort((a, b) =>
      (a.appointmentDate + a.appointmentTime).localeCompare(b.appointmentDate + b.appointmentTime)
    );
    if (filter === 'all') return list;
    return list.filter((a) => (a.appointmentDate || '').slice(0, 10) >= today && !isCancelled(a.status) && !isDone(a.status));
  }, [appointments, filter, today]);

  const groups = useMemo(() => {
    const m = new Map<string, ApiAppointment[]>();
    for (const a of shown) {
      const k = (a.appointmentDate || '').slice(0, 10) || 'Undated';
      (m.get(k) ?? m.set(k, []).get(k)!).push(a);
    }
    return [...m.entries()];
  }, [shown]);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <SectionTitle>Appointments</SectionTitle>
        <div className="flex bg-slate-100 rounded-lg p-0.5 text-[11px] font-bold">
          {(['upcoming', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-md capitalize transition-colors ${filter === f ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400'}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      {groups.length === 0 ? (
        <EmptyState icon={CalendarClock} text="Nothing here yet." />
      ) : (
        groups.map(([date, list]) => (
          <div key={date} className="space-y-2.5">
            <div className="text-[11px] font-bold text-slate-400">{prettyDate(date)}</div>
            {list.map((a) => (
              <ApptCard key={a.id} a={a} busyId={busyId} onConfirm={onConfirm} onCancel={onCancel} onComplete={onComplete} />
            ))}
          </div>
        ))
      )}
    </div>
  );
}

function PatientsTab({
  patients, search, setSearch,
}: {
  patients: ApiPatient[]; search: string; setSearch: (s: string) => void;
}) {
  const q = search.trim().toLowerCase();
  const shown = q
    ? patients.filter((p) => p.name.toLowerCase().includes(q) || (p.phone || '').includes(q))
    : patients;
  return (
    <div className="p-4 space-y-4">
      <SectionTitle>Clinic patients ({patients.length})</SectionTitle>
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or phone…"
          className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none focus:border-emerald-400"
        />
      </div>
      {shown.length === 0 ? (
        <EmptyState icon={Users} text={q ? 'No matching patients.' : 'No patients yet.'} />
      ) : (
        <div className="space-y-2">
          {shown.map((p) => (
            <div key={p.id} className="bg-white rounded-2xl border border-slate-100 p-3 shadow-sm flex items-center gap-3">
              <span className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 font-bold flex items-center justify-center shrink-0 text-sm">
                {initials(p.name)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-slate-900 text-sm truncate">{p.name}</div>
                <div className="text-[11px] text-slate-400 flex items-center gap-1"><Phone className="w-3 h-3" /> {p.phone}</div>
              </div>
              <a href={`tel:${p.phone}`} className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                <Phone className="w-4 h-4" />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MoreTab({ clinicName, userName, onLogout }: { clinicName?: string; userName?: string; onLogout: () => void }) {
  return (
    <div className="p-4 space-y-4">
      <SectionTitle>Account</SectionTitle>
      <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
        <div className="font-bold text-slate-900">{clinicName || 'ClinicBook AI'}</div>
        {userName && <div className="text-sm text-slate-400">{userName}</div>}
      </div>
      <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm text-xs text-slate-500 leading-relaxed">
        Billing, developer API keys and advanced settings open in your browser at{' '}
        <span className="font-semibold text-slate-700">clinicbookai.nextdoc.in</span> — richer screens that suit a bigger display.
      </div>
      <button
        onClick={onLogout}
        className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-rose-50 text-rose-600 font-bold text-sm"
      >
        <LogOut className="w-4 h-4" /> Sign out
      </button>
    </div>
  );
}

const EmptyState = ({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) => (
  <div className="flex flex-col items-center justify-center py-14 text-slate-300">
    <Icon className="w-10 h-10 mb-2" />
    <div className="text-sm text-slate-400">{text}</div>
  </div>
);

function prettyDate(key: string): string {
  if (key === todayKey()) return 'Today';
  const d = new Date(key + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return key;
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}
