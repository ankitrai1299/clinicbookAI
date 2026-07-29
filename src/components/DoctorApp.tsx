import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calendar, Users, MoreHorizontal, Clock, Phone, Check, X, Loader2, LogOut,
  Stethoscope, CalendarClock, CheckCircle2,
} from 'lucide-react';

import {
  loginDoctor, getDoctorMe, getMyAppointments, getMyPatients, decideAppointment,
  getDoctorToken, setDoctorToken, clearDoctorToken,
  type DoctorAccount, type DoctorAppointment, type DoctorPatient,
} from '../api/doctorPortal';
import { ApiError } from '../api/client';

// ─────────────────────────────────────────────────────────────────────────────
// The doctor side of the ClinicBook app — a SEPARATE login (its own doctor_token)
// from the clinic admin. A doctor sees ONLY their own data. Phase 1: login +
// today's/upcoming appointments (approve / reject) + their patients. Waitlist and
// the WhatsApp AI message log come in later phases.
// ─────────────────────────────────────────────────────────────────────────────

type Tab = 'appointments' | 'patients' | 'more';

const S = (s: string) => (s || '').toUpperCase();
const isPending = (s: string) => S(s) === 'PENDING';
const isCancelled = (s: string) => ['CANCELLED', 'CANCELED', 'NO_SHOW', 'REJECTED'].includes(S(s));
const isDone = (s: string) => S(s) === 'COMPLETED';

const statusChip = (s: string): { label: string; cls: string } => {
  if (S(s) === 'CONFIRMED' || S(s) === 'APPROVED') return { label: 'Confirmed', cls: 'bg-emerald-50 text-emerald-700' };
  if (isDone(s)) return { label: 'Completed', cls: 'bg-slate-100 text-slate-500' };
  if (isCancelled(s)) return { label: 'Cancelled', cls: 'bg-rose-50 text-rose-600' };
  return { label: 'Pending', cls: 'bg-amber-50 text-amber-700' };
};

const initials = (name?: string) =>
  (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';

const exitDoctor = () => {
  clearDoctorToken();
  const u = new URL(window.location.href);
  u.searchParams.delete('role');
  window.location.assign(u.toString());
};

export default function DoctorApp() {
  const [authed, setAuthed] = useState<boolean>(() => !!getDoctorToken());
  const [doctor, setDoctor] = useState<DoctorAccount | null>(null);

  if (!authed) {
    return <DoctorLogin onLoggedIn={(d) => { setDoctor(d); setAuthed(true); }} />;
  }
  return <DoctorHome doctor={doctor} setDoctor={setDoctor} />;
}

// ── login ────────────────────────────────────────────────────────────────────

function DoctorLogin({ onLoggedIn }: { onLoggedIn: (d: DoctorAccount) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await loginDoctor({ email: email.trim(), password });
      setDoctorToken(res.accessToken);
      onLoggedIn(res.doctor);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center px-6">
      <div className="mx-auto w-full max-w-sm">
        <div className="flex items-center gap-2 mb-6">
          <span className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white">
            <Stethoscope className="w-5 h-5" />
          </span>
          <div>
            <div className="text-lg font-extrabold text-slate-900 leading-tight">Doctor Login</div>
            <div className="text-xs text-slate-400">ClinicBook AI</div>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="Email" autoComplete="username" required
            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-400"
          />
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Password" autoComplete="current-password" required
            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-400"
          />
          {error && (
            <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>
          )}
          <button
            type="submit" disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white font-bold text-sm disabled:opacity-60"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Sign in
          </button>
        </form>

        <p className="text-[11px] text-slate-400 mt-4 text-center leading-relaxed">
          Your clinic admin gives you this login. You'll only see your own appointments and patients.
        </p>
        <button onClick={exitDoctor} className="w-full text-xs text-slate-400 mt-4 underline">
          Clinic admin login instead
        </button>
      </div>
    </div>
  );
}

// ── logged-in shell ──────────────────────────────────────────────────────────

function DoctorHome({ doctor, setDoctor }: { doctor: DoctorAccount | null; setDoctor: (d: DoctorAccount) => void }) {
  const [tab, setTab] = useState<Tab>('appointments');
  const [appointments, setAppointments] = useState<DoctorAppointment[]>([]);
  const [patients, setPatients] = useState<DoctorPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [me, appts, pats] = await Promise.allSettled([
      doctor ? Promise.resolve(doctor) : getDoctorMe(),
      getMyAppointments(),
      getMyPatients(),
    ]);
    if (me.status === 'fulfilled' && me.value) setDoctor(me.value);
    if (appts.status === 'fulfilled') setAppointments(appts.value);
    if (pats.status === 'fulfilled') setPatients(pats.value);
    setLoading(false);
  }, [doctor, setDoctor]);

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);

  const decide = async (id: string, action: 'approve' | 'reject') => {
    setBusyId(id);
    try {
      const updated = await decideAppointment(id, { action });
      setAppointments((list) => list.map((a) => (a.id === id ? { ...a, ...updated } : a)));
    } catch {
      /* re-fetched on next load */
    } finally {
      setBusyId(null);
    }
  };

  const sorted = useMemo(
    () => [...appointments].sort((a, b) =>
      (a.appointmentDate + a.appointmentTime).localeCompare(b.appointmentDate + b.appointmentTime)
    ),
    [appointments]
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-100 px-4 py-3 flex items-center gap-2">
        <span className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-700 font-bold flex items-center justify-center text-sm">
          {initials(doctor?.name)}
        </span>
        <div className="min-w-0">
          <div className="text-sm font-extrabold text-slate-900 truncate leading-tight">{doctor?.name || 'Doctor'}</div>
          <div className="text-[10px] text-slate-400 leading-tight">{doctor?.speciality || 'Doctor'}</div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-24">
        {loading ? (
          <div className="flex items-center justify-center py-24 text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : tab === 'appointments' ? (
          <div className="p-4 space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">My appointments</h2>
            {sorted.length === 0 ? (
              <Empty icon={CalendarClock} text="No appointments yet." />
            ) : (
              sorted.map((a) => {
                const chip = statusChip(a.status);
                const busy = busyId === a.id;
                return (
                  <div key={a.id} className="bg-white rounded-2xl border border-slate-100 p-3.5 shadow-sm">
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
                          <Clock className="w-3 h-3" /> {a.appointmentDate} · {a.appointmentTime}
                        </div>
                      </div>
                    </div>
                    {isPending(a.status) && (
                      <div className="flex gap-2 mt-3">
                        <button onClick={() => decide(a.id, 'approve')} disabled={busy}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold disabled:opacity-60">
                          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Approve
                        </button>
                        <button onClick={() => decide(a.id, 'reject')} disabled={busy}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-rose-50 text-rose-600 text-xs font-bold disabled:opacity-60">
                          <X className="w-3.5 h-3.5" /> Reject
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : tab === 'patients' ? (
          <div className="p-4 space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">My patients ({patients.length})</h2>
            {patients.length === 0 ? (
              <Empty icon={Users} text="No patients yet." />
            ) : (
              patients.map((p) => (
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
              ))
            )}
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">Account</h2>
            <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
              <div className="font-bold text-slate-900">{doctor?.name}</div>
              <div className="text-sm text-slate-400">{doctor?.speciality}</div>
              {doctor?.email && <div className="text-xs text-slate-400 mt-1">{doctor.email}</div>}
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm text-xs text-slate-500 leading-relaxed">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 inline mr-1" />
              Waitlist and the WhatsApp message log are coming soon to your app.
            </div>
            <button onClick={exitDoctor}
              className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-rose-50 text-rose-600 font-bold text-sm">
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-20 bg-white border-t border-slate-100 grid grid-cols-3">
        {([
          { id: 'appointments', label: 'Appointments', Icon: Calendar },
          { id: 'patients', label: 'Patients', Icon: Users },
          { id: 'more', label: 'More', Icon: MoreHorizontal },
        ] as const).map(({ id, label, Icon }) => {
          const on = tab === id;
          return (
            <button key={id} onClick={() => setTab(id)}
              className={`flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold ${on ? 'text-emerald-600' : 'text-slate-400'}`}>
              <Icon className="w-5 h-5" strokeWidth={on ? 2.4 : 1.8} />
              {label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

const Empty = ({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) => (
  <div className="flex flex-col items-center justify-center py-14 text-slate-300">
    <Icon className="w-10 h-10 mb-2" />
    <div className="text-sm text-slate-400">{text}</div>
  </div>
);
