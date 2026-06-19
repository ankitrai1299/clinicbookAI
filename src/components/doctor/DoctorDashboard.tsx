import React, { useCallback, useEffect, useState } from 'react';
import {
  Stethoscope, LogOut, CalendarClock, Clock, CalendarOff, Users, Check, X, Pencil,
  Loader2, Save, Plus, Trash2, Phone
} from 'lucide-react';

import {
  DoctorAccount, DoctorAppointment, DoctorLeave, DoctorSchedule, ScheduleEntryInput,
  addMyLeave, decideAppointment, deleteMyLeave, getMyAppointments, getMyLeaves,
  getMyPatients, getMySchedule, setMySchedule, DoctorPatient
} from '../../api/doctorPortal';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
type Tab = 'requests' | 'schedule' | 'leaves' | 'patients';

interface Props {
  doctor: DoctorAccount;
  onLogout: () => void;
}

const statusColor = (s: string) => {
  switch (s) {
    case 'CONFIRMED': return 'bg-emerald-50 text-emerald-700';
    case 'PENDING': return 'bg-amber-50 text-amber-700';
    case 'CANCELLED': return 'bg-red-50 text-red-600';
    case 'COMPLETED': return 'bg-sky-50 text-sky-700';
    default: return 'bg-slate-100 text-slate-600';
  }
};

const blankWeek = (): (ScheduleEntryInput & { enabled: boolean })[] =>
  DAYS.map((_, i) => ({ dayOfWeek: i, enabled: i >= 1 && i <= 5, startTime: '09:00', endTime: '17:00', slotMinutes: 30, isActive: true }));

export default function DoctorDashboard({ doctor, onLogout }: Props) {
  const [tab, setTab] = useState<Tab>('requests');

  return (
    <div className="min-h-screen bg-[#fafcff] font-sans">
      <header className="bg-white border-b border-slate-100 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-600 flex items-center justify-center">
              <Stethoscope className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-display font-extrabold text-slate-950 leading-tight">{doctor.name}</h1>
              <p className="text-slate-400 text-xs">{doctor.speciality} · Doctor Portal</p>
            </div>
          </div>
          <button onClick={onLogout} className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-red-600 px-3 py-2 rounded-lg hover:bg-red-50">
            <LogOut className="w-4 h-4" /> Log out
          </button>
        </div>
        <div className="max-w-5xl mx-auto px-5 flex gap-1">
          {([
            ['requests', 'Requests', CalendarClock],
            ['schedule', 'Schedule', Clock],
            ['leaves', 'Leaves', CalendarOff],
            ['patients', 'Patients', Users]
          ] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-xs font-bold flex items-center gap-1.5 border-b-2 -mb-px ${tab === key ? 'border-sky-600 text-sky-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 py-6">
        {tab === 'requests' && <RequestsTab />}
        {tab === 'schedule' && <ScheduleTab />}
        {tab === 'leaves' && <LeavesTab />}
        {tab === 'patients' && <PatientsTab />}
      </main>
    </div>
  );
}

// --- Requests (real-time appointment requests) -----------------------------
function RequestsTab() {
  const [appts, setAppts] = useState<DoctorAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [reForm, setReForm] = useState({ date: '', time: '' });

  const load = useCallback(async () => {
    try {
      const data = await getMyAppointments();
      setAppts(data);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load appointments');
    } finally {
      setLoading(false);
    }
  }, []);

  // Real-time: poll every 7s so new WhatsApp booking requests appear live.
  useEffect(() => {
    load();
    const t = setInterval(load, 7000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (id: string, action: 'approve' | 'reject' | 'reschedule', extra?: { appointmentDate: string; appointmentTime: string }) => {
    setBusyId(id);
    setError('');
    try {
      await decideAppointment(id, { action, ...extra });
      setRescheduleId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  const pending = appts.filter((a) => a.status === 'PENDING');
  const others = appts.filter((a) => a.status !== 'PENDING');

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      {error && <Banner text={error} />}

      <Section
        title="Appointment requests"
        subtitle="New WhatsApp bookings awaiting your decision — updates live."
        right={<span className="flex items-center gap-1 text-[11px] text-emerald-600 font-bold"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live</span>}
      >
        {pending.length === 0 ? (
          <Empty text="No pending requests right now. New WhatsApp bookings will appear here automatically." />
        ) : (
          <div className="space-y-2">
            {pending.map((a) => (
              <div key={a.id} className="bg-amber-50/40 border border-amber-100 rounded-2xl p-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-bold text-sm text-slate-900">{a.patient?.name ?? 'Unknown patient'}</p>
                    <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                      <CalendarClock className="w-3.5 h-3.5" /> {a.appointmentDate.slice(0, 10)} at {a.appointmentTime}
                      {a.patient?.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{a.patient.phone}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button disabled={busyId === a.id} onClick={() => act(a.id, 'approve')} className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg">
                      {busyId === a.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Approve
                    </button>
                    <button disabled={busyId === a.id} onClick={() => act(a.id, 'reject')} className="flex items-center gap-1 px-3 py-1.5 bg-white border border-red-200 hover:bg-red-50 disabled:opacity-50 text-red-600 text-xs font-bold rounded-lg">
                      <X className="w-3.5 h-3.5" /> Reject
                    </button>
                    <button onClick={() => { setRescheduleId(rescheduleId === a.id ? null : a.id); setReForm({ date: a.appointmentDate.slice(0, 10), time: a.appointmentTime }); }} className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold rounded-lg">
                      <Pencil className="w-3.5 h-3.5" /> Reschedule
                    </button>
                  </div>
                </div>

                {rescheduleId === a.id && (
                  <div className="flex items-end gap-2 mt-3 pt-3 border-t border-amber-100">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">
                      Date
                      <input type="date" value={reForm.date} onChange={(e) => setReForm({ ...reForm, date: e.target.value })} className="block mt-1 text-xs px-2 py-1.5 bg-white border border-slate-200 rounded-lg" />
                    </label>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">
                      Time
                      <input value={reForm.time} onChange={(e) => setReForm({ ...reForm, time: e.target.value })} placeholder="10:00 AM" className="block mt-1 text-xs px-2 py-1.5 bg-white border border-slate-200 rounded-lg" />
                    </label>
                    <button disabled={busyId === a.id || !reForm.date || !reForm.time} onClick={() => act(a.id, 'reschedule', { appointmentDate: reForm.date, appointmentTime: reForm.time })} className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg">
                      Save new time
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="All appointments" subtitle="Your confirmed, completed and cancelled appointments.">
        {others.length === 0 ? (
          <Empty text="Nothing here yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 text-left border-b border-slate-150">
                  <th className="py-2 px-2">Date</th><th className="py-2 px-2">Time</th><th className="py-2 px-2">Patient</th><th className="py-2 px-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {others.map((a) => (
                  <tr key={a.id} className="border-b border-slate-100">
                    <td className="py-2 px-2 font-mono text-slate-700">{a.appointmentDate.slice(0, 10)}</td>
                    <td className="py-2 px-2 font-mono text-slate-700">{a.appointmentTime}</td>
                    <td className="py-2 px-2 font-bold text-slate-800">{a.patient?.name ?? '—'}</td>
                    <td className="py-2 px-2"><span className={`px-2 py-0.5 rounded-full font-bold ${statusColor(a.status)}`}>{a.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

// --- Schedule --------------------------------------------------------------
function ScheduleTab() {
  const [week, setWeek] = useState(blankWeek());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    getMySchedule().then((sched: DoctorSchedule[]) => {
      setWeek(blankWeek().map((row) => {
        const found = sched.find((s) => s.dayOfWeek === row.dayOfWeek && s.isActive);
        return found ? { ...row, enabled: true, startTime: found.startTime, endTime: found.endTime, slotMinutes: found.slotMinutes } : { ...row, enabled: false };
      }));
    }).finally(() => setLoading(false));
  }, []);

  const update = (day: number, patch: Partial<typeof week[number]>) =>
    setWeek((prev) => prev.map((r) => (r.dayOfWeek === day ? { ...r, ...patch } : r)));

  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      const entries: ScheduleEntryInput[] = week.filter((r) => r.enabled).map(({ dayOfWeek, startTime, endTime, slotMinutes }) => ({ dayOfWeek, startTime, endTime, slotMinutes, isActive: true }));
      await setMySchedule(entries);
      setMsg('Schedule saved ✓');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner />;

  return (
    <Section title="Weekly availability" subtitle="The AI offers patients open slots from this schedule.">
      <div className="space-y-2">
        {week.map((row) => (
          <div key={row.dayOfWeek} className={`grid grid-cols-12 items-center gap-2 p-2.5 rounded-xl border ${row.enabled ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-100'}`}>
            <label className="col-span-4 sm:col-span-3 flex items-center gap-2 text-xs font-bold text-slate-700">
              <input type="checkbox" checked={row.enabled} onChange={(e) => update(row.dayOfWeek, { enabled: e.target.checked })} className="accent-sky-600" />
              {DAYS[row.dayOfWeek].slice(0, 3)}
            </label>
            <div className="col-span-8 sm:col-span-9 grid grid-cols-3 gap-2">
              <input type="time" disabled={!row.enabled} value={row.startTime} onChange={(e) => update(row.dayOfWeek, { startTime: e.target.value })} className="text-xs px-2 py-1.5 bg-white border border-slate-200 rounded-lg disabled:opacity-40" />
              <input type="time" disabled={!row.enabled} value={row.endTime} onChange={(e) => update(row.dayOfWeek, { endTime: e.target.value })} className="text-xs px-2 py-1.5 bg-white border border-slate-200 rounded-lg disabled:opacity-40" />
              <select disabled={!row.enabled} value={row.slotMinutes} onChange={(e) => update(row.dayOfWeek, { slotMinutes: Number(e.target.value) })} className="text-xs px-2 py-1.5 bg-white border border-slate-200 rounded-lg disabled:opacity-40">
                {[15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m} min slots</option>)}
              </select>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 pt-4">
        <button onClick={save} disabled={saving} className="px-5 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-bold rounded-xl text-xs flex items-center gap-1.5">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save schedule
        </button>
        {msg && <span className="text-xs text-slate-500">{msg}</span>}
      </div>
    </Section>
  );
}

// --- Leaves ----------------------------------------------------------------
function LeavesTab() {
  const [leaves, setLeaves] = useState<DoctorLeave[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ startDate: '', endDate: '', reason: '' });
  const [error, setError] = useState('');

  const load = useCallback(() => getMyLeaves().then(setLeaves).catch(() => {}).finally(() => setLoading(false)), []);
  useEffect(() => { load(); }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.startDate || !form.endDate) return;
    setError('');
    try {
      await addMyLeave({ startDate: form.startDate, endDate: form.endDate, reason: form.reason.trim() || undefined });
      setForm({ startDate: '', endDate: '', reason: '' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add leave');
    }
  };

  const remove = async (id: string) => { await deleteMyLeave(id); load(); };

  if (loading) return <Spinner />;

  return (
    <Section title="Leaves" subtitle="Block dates — the AI won't offer slots while you're away.">
      {error && <Banner text={error} />}
      <form onSubmit={add} className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end bg-slate-50 border border-slate-150 rounded-2xl p-3 mb-4">
        <label className="text-[10px] font-bold text-slate-500 uppercase">From<input type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="block w-full mt-1 text-xs px-2 py-1.5 bg-white border border-slate-200 rounded-lg" /></label>
        <label className="text-[10px] font-bold text-slate-500 uppercase">To<input type="date" required value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="block w-full mt-1 text-xs px-2 py-1.5 bg-white border border-slate-200 rounded-lg" /></label>
        <label className="text-[10px] font-bold text-slate-500 uppercase">Reason<input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Vacation" className="block w-full mt-1 text-xs px-2 py-1.5 bg-white border border-slate-200 rounded-lg" /></label>
        <button type="submit" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5"><Plus className="w-3.5 h-3.5" /> Add</button>
      </form>
      {leaves.length === 0 ? <Empty text="No leaves scheduled." /> : (
        <div className="space-y-2">
          {leaves.map((lv) => (
            <div key={lv.id} className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-2.5">
              <div className="flex items-center gap-3 text-xs">
                <CalendarOff className="w-4 h-4 text-amber-500" />
                <span className="font-bold text-slate-700">{lv.startDate.slice(0, 10)} → {lv.endDate.slice(0, 10)}</span>
                {lv.reason && <span className="text-slate-400">· {lv.reason}</span>}
              </div>
              <button onClick={() => remove(lv.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// --- Patients --------------------------------------------------------------
function PatientsTab() {
  const [patients, setPatients] = useState<DoctorPatient[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { getMyPatients().then(setPatients).catch(() => {}).finally(() => setLoading(false)); }, []);

  if (loading) return <Spinner />;

  return (
    <Section title="My patients" subtitle="Patients who have booked with you.">
      {patients.length === 0 ? <Empty text="No patients yet. They appear here once they book with you via WhatsApp." /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 text-left border-b border-slate-150">
                <th className="py-2 px-2">Name</th><th className="py-2 px-2">Phone</th><th className="py-2 px-2">Language</th><th className="py-2 px-2">ID</th>
              </tr>
            </thead>
            <tbody>
              {patients.map((p) => (
                <tr key={p.id} className="border-b border-slate-100">
                  <td className="py-2 px-2 font-bold text-slate-800">{p.name}</td>
                  <td className="py-2 px-2 font-mono text-slate-600">{p.phone}</td>
                  <td className="py-2 px-2 text-slate-600">{p.language}</td>
                  <td className="py-2 px-2 font-mono text-slate-400">{p.patientCode ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

// --- Shared bits -----------------------------------------------------------
function Section({ title, subtitle, right, children }: { title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-100 rounded-3xl p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="font-display font-extrabold text-slate-950">{title}</h2>
          {subtitle && <p className="text-slate-400 text-xs mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

const Spinner = () => (
  <div className="flex items-center justify-center py-20 text-slate-300"><Loader2 className="w-6 h-6 animate-spin" /></div>
);
const Empty = ({ text }: { text: string }) => (
  <p className="text-xs text-slate-400 italic py-6 text-center border border-dashed border-slate-200 rounded-2xl">{text}</p>
);
const Banner = ({ text }: { text: string }) => (
  <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2 text-xs mb-3">{text}</div>
);
