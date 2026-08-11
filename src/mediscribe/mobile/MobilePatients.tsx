import React from 'react';
import { Users, Plus, ChevronRight, CalendarDays, FileText } from 'lucide-react';
import { Consultation, Patient } from '../types';
import { Avatar, Card, SearchBar, EmptyState, recordTime } from './ui';

// The doctor's patients, each with what actually helps recognise them: age and
// sex, what they last came in with, when that was, and how many times.
//
// The complaint chips are the chief complaints from that patient's most recent
// consultation — real clinical text the doctor dictated, not tags anyone typed.
// A patient with no consultation yet simply shows none, rather than a guess.

interface MobilePatientsProps {
  patients: Patient[];
  consultations: Consultation[];
  onSelectPatient?: (p: Patient) => void;
  onAddPatient?: () => void;
}

const chipsFrom = (c?: Consultation): string[] => {
  const cc = c?.report?.chiefComplaint;
  const list = Array.isArray(cc) ? cc : typeof cc === 'string' && cc ? [cc] : [];
  return list.map((s) => String(s).trim()).filter(Boolean).slice(0, 3);
};

const CHIP_TONES = ['bg-[#EEEFFE] text-[#4A4BD4]', 'bg-[#EEEFFE] text-[#4A4BD4]', 'bg-[#ECFAF1] text-[#16A34A]'];

export default function MobilePatients({ patients, consultations, onSelectPatient, onAddPatient }: MobilePatientsProps) {
  const [query, setQuery] = React.useState('');

  // Per patient: their consultations, newest first. Keyed by id, falling back to
  // name so a record written before ids were stamped still finds its patient.
  const byPatient = React.useMemo(() => {
    const m = new Map<string, Consultation[]>();
    for (const c of consultations) {
      const key = c.patientId || c.patientName;
      if (!key) continue;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(c);
    }
    for (const list of m.values()) list.sort((a, b) => recordTime(b) - recordTime(a));
    return m;
  }, [consultations]);

  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return patients
      .filter((p) => {
        if (!q) return true;
        if ((p.name || '').toLowerCase().includes(q)) return true;
        if (digits.length < 3) return false;
        return (p.phone || '').replace(/\D/g, '').includes(digits);
      })
      .map((p) => {
        const list = byPatient.get(p.id) ?? byPatient.get(p.name) ?? [];
        return { patient: p, visits: list.length, latest: list[0] };
      })
      // Most recently seen first — a clinic day is about who is coming back.
      .sort((a, b) => (a.latest ? recordTime(a.latest) : 0) < (b.latest ? recordTime(b.latest) : 0) ? 1 : -1);
  }, [patients, query, byPatient]);

  return (
    <div className="px-5 pt-4">
      <div className="flex items-start justify-between mb-1">
        <h1 className="text-[28px] font-bold tracking-tight text-slate-900">Patients</h1>
        {onAddPatient && (
          <button
            onClick={onAddPatient}
            aria-label="Add patient"
            className="w-11 h-11 rounded-2xl bg-[#5B5CEB] text-white flex items-center justify-center shadow-sm shadow-[#5B5CEB]/30 active:scale-95 transition-transform"
          >
            <Plus size={22} strokeWidth={2.6} />
          </button>
        )}
      </div>
      <p className="text-[13.5px] text-slate-500 mb-4">
        {patients.length} patient{patients.length === 1 ? '' : 's'} · records &amp; visit history
      </p>

      <div className="mb-4">
        <SearchBar value={query} onChange={setQuery} placeholder="Search patients by name…" />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Users size={26} />}
          title={patients.length ? 'No matching patients' : 'No patients yet'}
          hint={patients.length ? 'Try a different name or number.' : 'Patients appear here once they are registered.'}
        />
      ) : (
        <div className="space-y-3">
          {rows.map(({ patient: p, visits, latest }) => {
            const chips = chipsFrom(latest);
            return (
              <Card key={p.id} className="p-4" onClick={onSelectPatient ? () => onSelectPatient(p) : undefined}>
                <div className="flex items-center gap-3">
                  <Avatar name={p.name} size={44} />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-900 text-[16px] truncate">{p.name}</div>
                    <div className="text-[12.5px] text-slate-400 mt-0.5">
                      {typeof p.age === 'number' && p.age > 0 ? `${p.age} yrs` : 'Age not recorded'}
                      {p.gender ? ` · ${p.gender}` : ''}
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-slate-300 flex-shrink-0" />
                </div>

                {chips.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {chips.map((c, i) => (
                      <span key={c} className={`text-[12px] font-medium px-2.5 py-1 rounded-lg ${CHIP_TONES[i % CHIP_TONES.length]}`}>
                        {c}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-100 text-[12px] text-slate-400">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays size={13} />
                    {latest ? `Last visit ${latest.date}` : 'No visit yet'}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <FileText size={13} />
                    {visits} consultation{visits === 1 ? '' : 's'}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
