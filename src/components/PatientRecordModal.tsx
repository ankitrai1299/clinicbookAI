import { useEffect, useState } from 'react';
import { X, CalendarDays, Stethoscope, Pill, ClipboardList, User, Phone, IdCard } from 'lucide-react';

import { getPatientRecord, type PatientRecord } from '../api/patientRecord';
import { realPhone } from '../utils/phone';

interface PatientRecordModalProps {
  // Internal patient id OR the Patient Code (PT-XXXX).
  patientId: string;
  onClose: () => void;
}

const prettyDate = (ymd: string): string => {
  const d = new Date(`${(ymd || '').slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? ymd
    : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
};

const prettyTime = (hhmm: string): string => {
  const [h, m] = (hhmm || '').split(':').map(Number);
  if (Number.isNaN(h)) return hhmm;
  const ap = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${ap}`;
};

const STATUS_STYLE: Record<string, string> = {
  CONFIRMED: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  PENDING: 'bg-amber-50 text-amber-700 border-amber-100',
  COMPLETED: 'bg-sky-50 text-sky-700 border-sky-100',
  CANCELLED: 'bg-slate-100 text-slate-500 border-slate-200',
  NO_SHOW: 'bg-rose-50 text-rose-700 border-rose-100'
};

export default function PatientRecordModal({ patientId, onClose }: PatientRecordModalProps) {
  const [record, setRecord] = useState<PatientRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getPatientRecord(patientId)
      .then((r) => !cancelled && setRecord(r))
      .catch((e) => !cancelled && setError(e?.message || 'Failed to load record'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  const p = record?.patient;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40" onClick={onClose}>
      <div
        className="bg-white w-full max-w-2xl max-h-[88vh] rounded-2xl shadow-xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4 bg-gradient-to-r from-sky-50 to-white">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-lg">
              <User size={18} className="text-sky-600" />
              <span className="truncate">{p?.name ?? 'Patient Record'}</span>
            </div>
            {p && (
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                {p.patientCode && (
                  <span className="inline-flex items-center gap-1 font-semibold text-sky-700">
                    <IdCard size={13} /> {p.patientCode}
                  </span>
                )}
                {realPhone(p.phone) && (
                  <span className="inline-flex items-center gap-1"><Phone size={13} /> {realPhone(p.phone)}</span>
                )}
                {(p.age || p.gender) && <span>{[p.age ? `${p.age}y` : null, p.gender].filter(Boolean).join(' · ')}</span>}
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 -mr-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading && <div className="py-12 text-center text-slate-400">Loading record…</div>}
          {error && <div className="py-8 text-center text-rose-600 text-sm">{error}</div>}

          {record && !loading && (
            <>
              {/* Summary chips */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Bookings', value: record.summary.totalBookings, icon: CalendarDays },
                  { label: 'Consultations', value: record.summary.totalConsultations, icon: Stethoscope },
                  { label: 'Active meds', value: record.summary.activeMedicines, icon: Pill }
                ].map((s) => {
                  const Icon = s.icon;
                  return (
                    <div key={s.label} className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
                      <Icon size={16} className="mx-auto text-sky-600 mb-1" />
                      <div className="text-xl font-bold text-slate-900">{s.value}</div>
                      <div className="text-[11px] font-medium text-slate-500">{s.label}</div>
                    </div>
                  );
                })}
              </div>

              {/* Current medicines */}
              {record.medicines.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-1.5"><Pill size={15} className="text-emerald-600" /> Current Medicines</h3>
                  <div className="space-y-1.5">
                    {record.medicines.map((m, i) => (
                      <div key={i} className="bg-emerald-50/60 border border-emerald-100 rounded-lg px-3 py-2 text-sm text-slate-800 flex justify-between gap-3">
                        <span className="font-medium">{m.drug}</span>
                        <span className="text-emerald-700 text-xs whitespace-nowrap">{m.times.map(prettyTime).join(', ')}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Bookings */}
              <section>
                <h3 className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-1.5"><CalendarDays size={15} className="text-sky-600" /> Appointments</h3>
                {record.bookings.length === 0 ? (
                  <div className="text-sm text-slate-400">No appointments yet.</div>
                ) : (
                  <div className="space-y-1.5">
                    {record.bookings.map((b) => (
                      <div key={b.id} className="flex items-center justify-between gap-3 border border-slate-100 rounded-lg px-3 py-2">
                        <div className="text-sm">
                          <span className="font-medium text-slate-900">{prettyDate(b.date)}, {b.time}</span>
                          {b.doctorName && <span className="text-slate-500"> · Dr. {b.doctorName.replace(/^dr\.?\s*/i, '')}</span>}
                        </div>
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${STATUS_STYLE[b.status] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>{b.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Consultation notes */}
              <section>
                <h3 className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-1.5"><ClipboardList size={15} className="text-purple-600" /> Consultation History</h3>
                {record.consultations.length === 0 ? (
                  <div className="text-sm text-slate-400">No consultation notes yet.</div>
                ) : (
                  <div className="space-y-2">
                    {record.consultations.map((c) => (
                      <div key={c.consultationId} className="border border-slate-100 rounded-lg px-3 py-2.5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-semibold text-slate-900">{prettyDate(c.visitDateTime)}</span>
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${c.reportStatus === 'Completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{c.reportStatus}</span>
                        </div>
                        {c.chiefComplaints?.length > 0 && <div className="text-xs text-slate-600"><span className="font-semibold">CC:</span> {c.chiefComplaints.join('; ')}</div>}
                        {c.diagnosis?.length > 0 && <div className="text-xs text-slate-600"><span className="font-semibold">Dx:</span> {c.diagnosis.join('; ')}</div>}
                        {c.medicines?.length > 0 && <div className="text-xs text-slate-600"><span className="font-semibold">Rx:</span> {c.medicines.map((m) => m.medicine).filter(Boolean).join(', ')}</div>}
                        {c.followUp && <div className="text-xs text-slate-500 mt-0.5">Follow-up: {c.followUp}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
