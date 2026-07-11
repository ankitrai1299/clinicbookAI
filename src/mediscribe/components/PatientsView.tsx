import { useState } from 'react';
import { motion } from 'motion/react';
import { Patient, Consultation } from '../types';
import { Search, ChevronRight, FileText } from 'lucide-react';
import PreviousConsultationHistory from './PreviousConsultationHistory';
import PatientRecordModal from '../../components/PatientRecordModal';

interface PatientsViewProps {
  patients: Patient[];
  consultations?: Consultation[];
  onOpenConsultation?: (con: Consultation) => void;
}

export default function PatientsView({ patients, consultations = [], onOpenConsultation }: PatientsViewProps) {
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Full 360 record modal (bookings + medicines + notes) for a patient.
  const [recordId, setRecordId] = useState<string | null>(null);

  const filtered = patients.filter(p =>
    (p.name || '').toLowerCase().includes(query.trim().toLowerCase()),
  );

  // Past consultations for a patient, most recent first.
  const historyFor = (patientId: string) =>
    consultations.filter(c => c.patientId === patientId);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Patients</h1>
          <p className="text-slate-500">
            {patients.length} {patients.length === 1 ? 'patient' : 'patients'} • manage records and past visits.
          </p>
        </div>
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
                      <span className="text-sm text-slate-400 hidden sm:inline">{p.phone || 'No phone'}</span>
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
    </motion.div>
  );
}
