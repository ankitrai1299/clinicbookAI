import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, Clock, Mail, Phone, Loader2, Save, CalendarOff, CalendarDays, Stethoscope, Pencil } from 'lucide-react';
import { realPhone } from '../utils/phone';
import {
  ApiDoctor,
  ApiLeave,
  ApiDoctorAppointment,
  ScheduleEntryInput,
  getDoctors,
  createDoctor,
  updateDoctor,
  deleteDoctor,
  getDoctorSchedule,
  setDoctorSchedule,
  getDoctorLeaves,
  addDoctorLeave,
  deleteDoctorLeave,
  getDoctorAppointments
} from '../api/doctors';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type SubTab = 'schedule' | 'leaves' | 'appointments';

interface ScheduleRow {
  enabled: boolean;
  startTime: string;
  endTime: string;
  slotMinutes: number;
}

const blankWeek = (): ScheduleRow[] =>
  DAYS.map((_, i) => ({
    enabled: i >= 1 && i <= 5, // Mon–Fri default on
    startTime: '09:00',
    endTime: '17:00',
    slotMinutes: 30
  }));

const statusColor = (s: string) => {
  switch (s) {
    case 'CONFIRMED': return 'bg-emerald-50 text-emerald-700';
    case 'PENDING': return 'bg-amber-50 text-amber-700';
    case 'CANCELLED': return 'bg-red-50 text-red-600';
    case 'COMPLETED': return 'bg-sky-50 text-sky-700';
    default: return 'bg-slate-100 text-slate-600';
  }
};

export default function DoctorWorkflow() {
  const [doctors, setDoctors] = useState<ApiDoctor[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Add-doctor form
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', speciality: '', experience: '', email: '', phone: '' });
  const [saving, setSaving] = useState(false);

  // Edit-doctor form (admin edits an existing doctor's profile)
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', speciality: '', experience: '', email: '', phone: '' });
  const [editSaving, setEditSaving] = useState(false);

  const [subTab, setSubTab] = useState<SubTab>('schedule');

  // Schedule
  const [week, setWeek] = useState<ScheduleRow[]>(blankWeek());
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleMsg, setScheduleMsg] = useState('');

  // Leaves
  const [leaves, setLeaves] = useState<ApiLeave[]>([]);
  const [leaveForm, setLeaveForm] = useState({ startDate: '', endDate: '', reason: '' });

  // Appointments
  const [appointments, setAppointments] = useState<ApiDoctorAppointment[]>([]);

  const selected = doctors.find((d) => d.id === selectedId) ?? null;

  const loadDoctors = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const docs = await getDoctors();
      setDoctors(docs);
      setSelectedId((cur) => cur || docs[0]?.id || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load doctors');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDoctors(); }, [loadDoctors]);

  // Load the selected doctor's schedule + leaves + appointments.
  const loadDoctorDetail = useCallback(async (id: string) => {
    setScheduleMsg('');
    setEditing(false);
    try {
      const [sched, lv, appts] = await Promise.all([
        getDoctorSchedule(id),
        getDoctorLeaves(id),
        getDoctorAppointments(id)
      ]);
      const next = blankWeek().map((row, day) => {
        const found = sched.find((s) => s.dayOfWeek === day && s.isActive);
        return found
          ? { enabled: true, startTime: found.startTime, endTime: found.endTime, slotMinutes: found.slotMinutes }
          : { ...row, enabled: false };
      });
      setWeek(next);
      setLeaves(lv);
      setAppointments(appts);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load doctor details');
    }
  }, []);

  useEffect(() => {
    if (selectedId) loadDoctorDetail(selectedId);
  }, [selectedId, loadDoctorDetail]);

  const handleAddDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.speciality.trim()) return;
    setSaving(true);
    setError('');
    try {
      const created = await createDoctor({
        name: form.name.trim(),
        speciality: form.speciality.trim(),
        experienceYears: form.experience.trim() ? Number(form.experience) : undefined,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined
      });
      setForm({ name: '', speciality: '', experience: '', email: '', phone: '' });
      setShowAdd(false);
      await loadDoctors();
      setSelectedId(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add doctor');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = () => {
    if (!selected) return;
    setEditForm({
      name: selected.name,
      speciality: selected.speciality,
      experience: selected.experienceYears != null ? String(selected.experienceYears) : '',
      email: selected.email ?? '',
      phone: selected.phone ?? ''
    });
    setError('');
    setEditing(true);
  };

  const handleUpdateDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !editForm.name.trim() || !editForm.speciality.trim()) return;
    setEditSaving(true);
    setError('');
    try {
      await updateDoctor(selected.id, {
        name: editForm.name.trim(),
        speciality: editForm.speciality.trim(),
        experienceYears: editForm.experience.trim() ? Number(editForm.experience) : null,
        email: editForm.email.trim() || undefined,
        phone: editForm.phone.trim() || undefined
      });
      setEditing(false);
      await loadDoctors();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update doctor');
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteDoctor = async (id: string) => {
    if (!confirm('Remove this doctor? Their schedule and leaves will also be removed.')) return;
    try {
      await deleteDoctor(id);
      setSelectedId('');
      await loadDoctors();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove doctor');
    }
  };

  const handleSaveSchedule = async () => {
    if (!selectedId) return;
    setScheduleSaving(true);
    setScheduleMsg('');
    try {
      const entries: ScheduleEntryInput[] = week
        .map((row, day) => ({ ...row, dayOfWeek: day }))
        .filter((row) => row.enabled)
        .map((row) => ({
          dayOfWeek: row.dayOfWeek,
          startTime: row.startTime,
          endTime: row.endTime,
          slotMinutes: row.slotMinutes,
          isActive: true
        }));
      await setDoctorSchedule(selectedId, entries);
      setScheduleMsg('Schedule saved ✓');
    } catch (e) {
      setScheduleMsg(e instanceof Error ? e.message : 'Failed to save schedule');
    } finally {
      setScheduleSaving(false);
    }
  };

  const handleAddLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || !leaveForm.startDate || !leaveForm.endDate) return;
    try {
      await addDoctorLeave(selectedId, {
        startDate: leaveForm.startDate,
        endDate: leaveForm.endDate,
        reason: leaveForm.reason.trim() || undefined
      });
      setLeaveForm({ startDate: '', endDate: '', reason: '' });
      setLeaves(await getDoctorLeaves(selectedId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add leave');
    }
  };

  const handleDeleteLeave = async (leaveId: string) => {
    if (!selectedId) return;
    try {
      await deleteDoctorLeave(selectedId, leaveId);
      setLeaves(await getDoctorLeaves(selectedId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove leave');
    }
  };

  const updateRow = (day: number, patch: Partial<ScheduleRow>) =>
    setWeek((prev) => prev.map((r, i) => (i === day ? { ...r, ...patch } : r)));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-100 rounded-3xl p-6 space-y-6 animate-fadeIn" id="doctor-workflow-view">
      <div className="border-b border-slate-150 pb-4 text-left flex items-center justify-between">
        <div>
          <h2 className="font-display font-extrabold text-lg text-slate-950">Doctors &amp; Schedules</h2>
          <p className="text-slate-400 text-xs">Add doctors, set weekly availability, manage leaves, and view each doctor’s appointments — all stored in the database.</p>
        </div>
        <button
          onClick={() => setShowAdd((s) => !s)}
          id="add-doctor-toggle"
          className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-xs"
        >
          <Plus className="w-4 h-4" /> Add Doctor
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2 text-xs">{error}</div>}

      {showAdd && (
        <form onSubmit={handleAddDoctor} className="bg-sky-50/60 border border-sky-100 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fadeIn text-left">
          <div>
            <label className="block text-[10px] font-bold text-sky-800 uppercase tracking-wider mb-1">Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Dr. Jane Doe" className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-sky-800 uppercase tracking-wider mb-1">Speciality</label>
            <input value={form.speciality} onChange={(e) => setForm({ ...form, speciality: e.target.value })} required placeholder="Cardiologist" className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-sky-800 uppercase tracking-wider mb-1">Experience (years, optional)</label>
            <input type="number" min={0} max={80} value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} placeholder="e.g. 10" className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-sky-800 uppercase tracking-wider mb-1">Email (optional)</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="dr.jane@clinic.com" className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-sky-800 uppercase tracking-wider mb-1">Phone (optional)</label>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="919876543210" className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500" />
          </div>
          <div className="sm:col-span-2 flex gap-2">
            <button type="submit" disabled={saving} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold rounded-xl text-xs flex items-center gap-1.5">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save Doctor
            </button>
            <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-xs">Cancel</button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Doctor list */}
        <div className="lg:col-span-4 space-y-2">
          {doctors.length === 0 && <p className="text-xs text-slate-400 italic">No doctors added yet. Click Add Doctor to create your first doctor.</p>}
          {doctors.map((d) => (
            <button
              key={d.id}
              onClick={() => setSelectedId(d.id)}
              className={`w-full text-left p-3 rounded-2xl border transition-all flex items-start justify-between gap-2 ${selectedId === d.id ? 'bg-sky-600 text-white border-sky-600 shadow-sm' : 'bg-white border-slate-200 hover:border-sky-300'}`}
            >
              <span className="flex items-start gap-2">
                <Stethoscope className={`w-4 h-4 mt-0.5 ${selectedId === d.id ? 'text-sky-100' : 'text-sky-500'}`} />
                <span>
                  <span className="block font-bold text-sm leading-tight">{d.name}</span>
                  <span className={`text-[10px] ${selectedId === d.id ? 'text-sky-100' : 'text-slate-400'}`}>{d.speciality}{d.experienceYears != null ? ` · ${d.experienceYears} yrs` : ''}</span>
                </span>
              </span>
            </button>
          ))}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-8">
          {!selected ? (
            <div className="py-16 text-center text-slate-400 italic text-xs border border-dashed border-slate-200 rounded-2xl">Select a doctor to manage their schedule, leaves and appointments.</div>
          ) : (
            <div className="space-y-5 text-left">
              {editing ? (
                <form onSubmit={handleUpdateDoctor} className="bg-sky-50/60 border border-sky-100 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fadeIn text-left">
                  <div>
                    <label className="block text-[10px] font-bold text-sky-800 uppercase tracking-wider mb-1">Name</label>
                    <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required placeholder="Dr. Jane Doe" className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-sky-800 uppercase tracking-wider mb-1">Speciality</label>
                    <input value={editForm.speciality} onChange={(e) => setEditForm({ ...editForm, speciality: e.target.value })} required placeholder="Cardiologist" className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-sky-800 uppercase tracking-wider mb-1">Experience (years, optional)</label>
                    <input type="number" min={0} max={80} value={editForm.experience} onChange={(e) => setEditForm({ ...editForm, experience: e.target.value })} placeholder="e.g. 10" className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-sky-800 uppercase tracking-wider mb-1">Email (optional)</label>
                    <input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} placeholder="dr.jane@clinic.com" className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-sky-800 uppercase tracking-wider mb-1">Phone (optional)</label>
                    <input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} placeholder="919876543210" className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500" />
                  </div>
                  <div className="sm:col-span-2 flex gap-2">
                    <button type="submit" disabled={editSaving} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold rounded-xl text-xs flex items-center gap-1.5">
                      {editSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save Changes
                    </button>
                    <button type="button" onClick={() => setEditing(false)} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-xs">Cancel</button>
                  </div>
                </form>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-display font-extrabold text-slate-900">{selected.name}</h3>
                    <div className="flex flex-wrap gap-3 text-[11px] text-slate-500 mt-1">
                      <span className="bg-sky-50 text-sky-700 font-bold px-2 py-0.5 rounded-full">{selected.speciality}</span>
                      {selected.experienceYears != null && <span className="bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full">{selected.experienceYears} yrs exp</span>}
                      {selected.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{selected.email}</span>}
                      {selected.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{selected.phone}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={startEdit} className="p-2 text-sky-600 hover:bg-sky-50 rounded-lg" title="Edit profile">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDeleteDoctor(selected.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg" title="Remove doctor">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Sub tabs */}
              <div className="flex gap-2 border-b border-slate-150">
                {([['schedule', 'Schedule', Clock], ['leaves', 'Leaves', CalendarOff], ['appointments', 'Appointments', CalendarDays]] as const).map(([key, label, Icon]) => (
                  <button
                    key={key}
                    onClick={() => setSubTab(key)}
                    className={`px-3 py-2 text-xs font-bold flex items-center gap-1.5 border-b-2 -mb-px ${subTab === key ? 'border-sky-600 text-sky-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                  >
                    <Icon className="w-3.5 h-3.5" /> {label}
                  </button>
                ))}
              </div>

              {/* Schedule editor */}
              {subTab === 'schedule' && (
                <div className="space-y-2">
                  {week.map((row, day) => (
                    <div key={day} className={`grid grid-cols-12 items-center gap-2 p-2.5 rounded-xl border ${row.enabled ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-100'}`}>
                      <label className="col-span-4 sm:col-span-3 flex items-center gap-2 text-xs font-bold text-slate-700">
                        <input type="checkbox" checked={row.enabled} onChange={(e) => updateRow(day, { enabled: e.target.checked })} className="accent-sky-600" />
                        {DAYS[day].slice(0, 3)}
                      </label>
                      <div className="col-span-8 sm:col-span-9 grid grid-cols-3 gap-2">
                        <input type="time" disabled={!row.enabled} value={row.startTime} onChange={(e) => updateRow(day, { startTime: e.target.value })} className="text-xs px-2 py-1.5 bg-white border border-slate-200 rounded-lg disabled:opacity-40" />
                        <input type="time" disabled={!row.enabled} value={row.endTime} onChange={(e) => updateRow(day, { endTime: e.target.value })} className="text-xs px-2 py-1.5 bg-white border border-slate-200 rounded-lg disabled:opacity-40" />
                        <select disabled={!row.enabled} value={row.slotMinutes} onChange={(e) => updateRow(day, { slotMinutes: Number(e.target.value) })} className="text-xs px-2 py-1.5 bg-white border border-slate-200 rounded-lg disabled:opacity-40">
                          {[15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m} min slots</option>)}
                        </select>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center gap-3 pt-2">
                    <button onClick={handleSaveSchedule} disabled={scheduleSaving} className="px-5 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-bold rounded-xl text-xs flex items-center gap-1.5">
                      {scheduleSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save Schedule
                    </button>
                    {scheduleMsg && <span className="text-xs text-slate-500">{scheduleMsg}</span>}
                  </div>
                </div>
              )}

              {/* Leaves */}
              {subTab === 'leaves' && (
                <div className="space-y-4">
                  <form onSubmit={handleAddLeave} className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end bg-slate-50 border border-slate-150 rounded-2xl p-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">From</label>
                      <input type="date" required value={leaveForm.startDate} onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })} className="w-full text-xs px-2 py-1.5 bg-white border border-slate-200 rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">To</label>
                      <input type="date" required value={leaveForm.endDate} onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })} className="w-full text-xs px-2 py-1.5 bg-white border border-slate-200 rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Reason</label>
                      <input value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} placeholder="Vacation" className="w-full text-xs px-2 py-1.5 bg-white border border-slate-200 rounded-lg" />
                    </div>
                    <button type="submit" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5"><Plus className="w-3.5 h-3.5" /> Add</button>
                  </form>
                  {leaves.length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-4 text-center">No leaves scheduled.</p>
                  ) : (
                    <div className="space-y-2">
                      {leaves.map((lv) => (
                        <div key={lv.id} className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-2.5">
                          <div className="flex items-center gap-3 text-xs">
                            <CalendarOff className="w-4 h-4 text-amber-500" />
                            <span className="font-bold text-slate-700">{lv.startDate.slice(0, 10)} → {lv.endDate.slice(0, 10)}</span>
                            {lv.reason && <span className="text-slate-400">· {lv.reason}</span>}
                          </div>
                          <button onClick={() => handleDeleteLeave(lv.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Appointments */}
              {subTab === 'appointments' && (
                <div>
                  {appointments.length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-6 text-center">No appointments for this doctor.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-slate-400 text-left border-b border-slate-150">
                            <th className="py-2 px-2">Date</th>
                            <th className="py-2 px-2">Time</th>
                            <th className="py-2 px-2">Patient</th>
                            <th className="py-2 px-2">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {appointments.map((a) => (
                            <tr key={a.id} className="border-b border-slate-100">
                              <td className="py-2 px-2 font-mono text-slate-700">{a.appointmentDate.slice(0, 10)}</td>
                              <td className="py-2 px-2 font-mono text-slate-700">{a.appointmentTime}</td>
                              <td className="py-2 px-2">
                                <span className="font-bold text-slate-800">{a.patient?.name ?? '—'}</span>
                                {realPhone(a.patient?.phone) && <span className="block text-[10px] text-slate-400">{realPhone(a.patient?.phone)}</span>}
                              </td>
                              <td className="py-2 px-2"><span className={`px-2 py-0.5 rounded-full font-bold ${statusColor(a.status)}`}>{a.status}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
