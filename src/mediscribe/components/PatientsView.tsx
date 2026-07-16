import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Patient, Consultation } from '../types';
import { Search, ChevronRight, FileText, Plus, X } from 'lucide-react';
import PreviousConsultationHistory from './PreviousConsultationHistory';
import PatientRecordModal from '../../components/PatientRecordModal';
import { realPhone } from '../../utils/phone';

interface PatientsViewProps {
  patients: Patient[];
  consultations?: Consultation[];
  onOpenConsultation?: (con: Consultation) => void;
  onAddPatient?: (name: string, age: number, gender: string, phone: string) => Promise<void>;
}

export default function PatientsView({ patients, consultations = [], onOpenConsultation, onAddPatient }: PatientsViewProps) {
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Full 360 record modal (bookings + medicines + notes) for a patient.
  const [recordId, setRecordId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const filtered = patients.filter(p =>
    (p.name || '').toLowerCase().includes(query.trim().toLowerCase()),
  );

  // Past consultations for a patient, most recent first.
  const historyFor = (patientId: string) =>
    consultations.filter(c => c.patientId === patientId);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-8">
      <div className="flex justify-between items-center gap-3 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Patients</h1>
          <p className="text-slate-500">
            {patients.length} {patients.length === 1 ? 'patient' : 'patients'} • manage records and past visits.
          </p>
        </div>
        {onAddPatient && (
          <button
            onClick={() => setAdding(true)}
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm shadow-sm transition-colors"
          >
            <Plus size={18} /> Add Patient
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="p-4 border-b border-slate-100 flex gap-4 items-center bg-slate-50">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search patients by name..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              {patients.length === 0 ? 'No patients yet. Start a new consultation to add one.' : 'No patients match your search.'}
            </div>
          ) : (
            filtered.map(p => {
              const history = historyFor(p.id);
              const isOpen = expandedId === p.id;
              return (
                <div key={p.id}>
                  <div
                    onClick={() => setExpandedId(isOpen ? null : p.id)}
                    className="p-4 flex items-center justify-between hover:bg-slate-50 cursor-pointer"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold">
                        {(p.name || '?').charAt(0)}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900">{p.name}</div>
                        <div className="text-sm text-slate-500">
                          {p.age} years • {p.gender}
                          {history.length > 0 && (
                            <span className="ml-2 text-slate-400">
                              • {history.length} {history.length === 1 ? 'visit' : 'visits'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {realPhone(p.phone) && (
                        <span className="text-sm text-slate-400 hidden sm:inline">{realPhone(p.phone)}</span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); setRecordId(p.id); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-semibold transition-colors"
                        title="Full record — bookings, medicines & notes"
                      >
                        <FileText size={14} /> Record
                      </button>
                      <ChevronRight
                        size={18}
                        className={`text-slate-300 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                      />
                    </div>
                  </div>

                  {/* Patient details — Previous Consultation History (fetched
                      from the dedicated endpoint when the profile is opened) */}
                  {isOpen && (
                    <div className="bg-slate-50/70 border-t border-slate-100 px-4 py-4">
                      <PreviousConsultationHistory
                        patientId={p.id}
                        onOpenConsultation={cid => {
                          const con = consultations.find(c => c.id === cid);
                          if (con) onOpenConsultation?.(con);
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {recordId && <PatientRecordModal patientId={recordId} onClose={() => setRecordId(null)} />}
      {adding && onAddPatient && (
        <AddPatientModal existing={patients} onAdd={onAddPatient} onClose={() => setAdding(false)} />
      )}
    </motion.div>
  );
}

const last10 = (p?: string | null) => (p || '').replace(/\D/g, '').slice(-10);

function AddPatientModal({
  existing,
  onAdd,
  onClose,
}: {
  existing: Patient[];
  onAdd: (name: string, age: number, gender: string, phone: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('Male');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const digits = phone.replace(/\D/g, '');
    if (!name.trim()) return setError('Please enter the patient name.');
    if (digits.length < 10) return setError('A valid 10-digit phone number is required.');
    // No duplicates: a phone already on file means it's the same patient.
    if (existing.some((p) => last10(p.phone) && last10(p.phone) === digits.slice(-10))) {
      return setError('A patient with this phone number already exists.');
    }
    setBusy(true);
    try {
      await onAdd(name.trim(), parseInt(age, 10) || 0, gender, phone.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add patient.');
    } finally {
      setBusy(false);
    }
  };

  const input =
    'w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all';
  const label = 'block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-900">Add New Patient</h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-red-700 text-sm font-medium">{error}</div>
          )}
          <div>
            <label className={label}>Full name</label>
            <input autoFocus className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Patient name" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={label}>Age</label>
              <input type="number" min={0} max={150} className={input} value={age} onChange={(e) => setAge(e.target.value)} placeholder="Age" />
            </div>
            <div>
              <label className={label}>Gender</label>
              <select className={input} value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>
          <div>
            <label className={label}>Phone number <span className="text-red-500">*</span></label>
            <input type="tel" className={input} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile number" />
            <p className="text-xs text-slate-400 mt-1">Required &amp; unique — one patient per phone number.</p>
          </div>
          <div className="pt-1 flex gap-3 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg font-semibold shadow-sm transition-colors">
              {busy ? 'Adding…' : 'Add Patient'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
