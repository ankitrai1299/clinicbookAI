import React, { useMemo, useState } from 'react';
import { X, Plus, Trash2, Pill, Search, Zap, Check } from 'lucide-react';
import { Patient, Consultation, MedicationRow, ReportData } from '../types';
import { createEmptyReport } from '../utils/report';
import { realPhone } from '../../utils/phone';

// QUICK PRESCRIPTION — for the many visits that don't need a recorded
// consultation (a refill, a follow-up, a two-minute complaint).
//
// It deliberately produces a NORMAL completed consultation with only the
// prescription filled in, so everything downstream already works untouched:
// the WhatsApp prescription + medicine reminders fire on save, the visit lands on
// the patient timeline, and the PDF/print path is the same one used everywhere.

const emptyRow = (): MedicationRow => ({
  medicine: '', strength: '', dose: '', route: '', frequency: '',
  timing: '', duration: '', instructions: '', purpose: '', compliance: '',
});

interface Props {
  patients: Patient[];
  /** Past consultations — used to suggest medicines this doctor already prescribes. */
  consultations: Consultation[];
  onClose: () => void;
  /** Saves the built consultation (same path a recorded visit uses). */
  onSave: (consultation: Consultation, report: ReportData) => Promise<void>;
}

export default function QuickPrescription({ patients, consultations, onClose, onSave }: Props) {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<MedicationRow[]>([emptyRow()]);
  const [advice, setAdvice] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Medicines this doctor has prescribed before — the fastest possible input for
  // the drugs they actually use, drawn from their own history (no new data).
  const knownMedicines = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of consultations) {
      for (const m of c.report?.prescribedMedications || []) {
        const name = (m.medicine || '').trim();
        if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b)).slice(0, 200);
  }, [consultations]);

  const filteredPatients = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patients.slice(0, 8);
    return patients
      .filter(p => (p.name || '').toLowerCase().includes(q) || (p.phone || '').includes(q))
      .slice(0, 8);
  }, [patients, query]);

  const setRow = (i: number, patch: Partial<MedicationRow>) =>
    setRows(prev => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const filledRows = rows.filter(r => r.medicine.trim());

  const submit = async () => {
    setError(null);
    if (!patient) return setError('Please choose a patient.');
    if (filledRows.length === 0) return setError('Add at least one medicine.');

    setBusy(true);
    try {
      const report: ReportData = {
        ...createEmptyReport(),
        prescribedMedications: filledRows,
        advice: advice.split('\n').map(s => s.trim()).filter(Boolean),
        assessment: diagnosis.trim() ? [diagnosis.trim()] : [],
        chiefComplaint: diagnosis.trim() ? [diagnosis.trim()] : [],
      };
      const now = new Date();
      const consultation: Consultation = {
        id: `con-${Date.now()}`,
        patientId: patient.id,
        patientName: patient.name,
        date: now.toLocaleDateString(),
        status: 'Completed',
        transcript: [],
        report,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
      await onSave(consultation, report);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the prescription.');
    } finally {
      setBusy(false);
    }
  };

  const input =
    'w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-slate-900/40 p-3 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl my-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-900 flex items-center gap-2">
            <Zap size={17} className="text-amber-500" /> Quick Prescription
          </h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-red-700 text-sm font-medium">{error}</div>
          )}

          {/* Patient */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Patient</label>
            {patient ? (
              <div className="flex items-center gap-3 bg-blue-50/60 border border-blue-100 rounded-xl px-4 py-2.5">
                <span className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                  {(patient.name || '?').charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-900 truncate">{patient.name}</div>
                  <div className="text-xs text-slate-500">
                    {patient.age ? `${patient.age} yrs · ` : ''}{patient.gender}
                    {realPhone(patient.phone) ? ` · ${realPhone(patient.phone)}` : ''}
                  </div>
                </div>
                <button onClick={() => setPatient(null)} className="text-xs font-bold text-blue-700 hover:underline">
                  Change
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    autoFocus
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search patient by name or phone…"
                    className={`${input} pl-9`}
                  />
                </div>
                <div className="mt-2 border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-48 overflow-y-auto">
                  {filteredPatients.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-slate-500">No patients found.</p>
                  ) : (
                    filteredPatients.map(p => (
                      <button
                        key={p.id}
                        onClick={() => setPatient(p)}
                        className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center justify-between gap-3"
                      >
                        <span className="min-w-0">
                          <span className="block font-medium text-slate-800 truncate">{p.name}</span>
                          <span className="block text-xs text-slate-500">
                            {p.age ? `${p.age} yrs · ` : ''}{p.gender}
                            {realPhone(p.phone) ? ` · ${realPhone(p.phone)}` : ''}
                          </span>
                        </span>
                        <Check size={15} className="text-slate-300" />
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          {/* Diagnosis (optional) */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Diagnosis / reason <span className="text-slate-400 normal-case font-normal">(optional)</span>
            </label>
            <input value={diagnosis} onChange={e => setDiagnosis(e.target.value)} placeholder="e.g. Acute pharyngitis" className={input} />
          </div>

          {/* Medicines */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                <Pill size={13} /> Medicines
              </label>
              <button
                onClick={() => setRows(r => [...r, emptyRow()])}
                className="flex items-center gap-1 text-xs font-bold text-blue-700 hover:text-blue-800"
              >
                <Plus size={14} /> Add medicine
              </button>
            </div>

            <datalist id="quick-rx-medicines">
              {knownMedicines.map(m => <option key={m} value={m} />)}
            </datalist>

            <div className="space-y-2">
              {rows.map((r, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-start">
                  <input
                    list="quick-rx-medicines"
                    value={r.medicine}
                    onChange={e => setRow(i, { medicine: e.target.value })}
                    placeholder="Medicine"
                    className={`${input} col-span-12 sm:col-span-4`}
                  />
                  <input
                    value={r.strength}
                    onChange={e => setRow(i, { strength: e.target.value })}
                    placeholder="Strength"
                    className={`${input} col-span-4 sm:col-span-2`}
                  />
                  <input
                    value={r.frequency}
                    onChange={e => setRow(i, { frequency: e.target.value })}
                    placeholder="Frequency"
                    title="e.g. twice daily — drives the WhatsApp medicine reminders"
                    className={`${input} col-span-4 sm:col-span-2`}
                  />
                  <input
                    value={r.duration}
                    onChange={e => setRow(i, { duration: e.target.value })}
                    placeholder="Duration"
                    className={`${input} col-span-4 sm:col-span-2`}
                  />
                  <input
                    value={r.instructions}
                    onChange={e => setRow(i, { instructions: e.target.value })}
                    placeholder="Instructions"
                    className={`${input} col-span-10 sm:col-span-1`}
                  />
                  <button
                    onClick={() => setRows(prev => (prev.length === 1 ? [emptyRow()] : prev.filter((_, idx) => idx !== i)))}
                    className="col-span-2 sm:col-span-1 h-[38px] flex items-center justify-center text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                    title="Remove"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">
              Frequency &amp; duration drive the patient's WhatsApp medicine reminders.
            </p>
          </div>

          {/* Advice */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Advice <span className="text-slate-400 normal-case font-normal">(one per line, optional)</span>
            </label>
            <textarea
              value={advice}
              onChange={e => setAdvice(e.target.value)}
              rows={2}
              placeholder="Plenty of fluids&#10;Return if fever persists beyond 3 days"
              className={`${input} resize-none`}
            />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            Saves as a completed visit — the prescription goes to the patient's WhatsApp.
          </p>
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={onClose} className="px-4 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50">
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={busy}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg font-semibold shadow-sm flex items-center gap-2"
            >
              {busy ? 'Saving…' : 'Save & send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
