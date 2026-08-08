import React from 'react';
import { FileText } from 'lucide-react';
import { Consultation, Patient } from '../types';
import {
  initials,
  recordTime,
  inRange,
  RangeKey,
  ScreenHeader,
  SearchBar,
  RangeChips,
  EmptyState,
} from './ui';

// Every consultation note this doctor has recorded. Search matches the patient's
// name OR their phone number, the same way the desktop lists do — in a clinic
// the number is often the only thing to hand.

interface MobileNotesProps {
  consultations: Consultation[];
  patients?: Patient[];
  onSelectConsultation: (con: Consultation) => void;
}

/** The one-line "what was this visit about", straight from the AI note. */
const summaryOf = (c: Consultation): string => {
  const cc = c.report?.chiefComplaint;
  if (Array.isArray(cc) && cc.length) return cc.join('; ');
  if (typeof cc === 'string' && cc) return cc;
  const firstLine = c.transcript?.find((t) => t?.text?.trim())?.text;
  return firstLine?.trim() || '';
};

export default function MobileNotes({ consultations, patients, onSelectConsultation }: MobileNotesProps) {
  const [query, setQuery] = React.useState('');
  const [range, setRange] = React.useState<RangeKey>('all');

  const phoneOf = React.useMemo(
    () => new Map((patients ?? []).map((p) => [p.id, p.phone || ''])),
    [patients]
  );

  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return consultations
      .filter((c) => inRange(recordTime(c), range))
      .filter((c) => {
        if (!q) return true;
        if ((c.patientName || '').toLowerCase().includes(q)) return true;
        if (summaryOf(c).toLowerCase().includes(q)) return true;
        // Only treat the query as a phone number once it's long enough to mean
        // one — otherwise "1" would match half the clinic.
        if (digits.length < 3) return false;
        return (phoneOf.get(c.patientId ?? '') || '').replace(/\D/g, '').includes(digits);
      })
      .sort((a, b) => recordTime(b) - recordTime(a));
  }, [consultations, query, range, phoneOf]);

  return (
    <div>
      <ScreenHeader title="My Notes" />

      <div className="px-5 space-y-3 mb-4">
        <SearchBar value={query} onChange={setQuery} placeholder="Search notes..." />
        <RangeChips value={range} onChange={setRange} />
      </div>

      <div className="px-5">
        {rows.length === 0 ? (
          <EmptyState
            icon={<FileText size={24} />}
            title={consultations.length ? 'Nothing matches' : 'No notes yet'}
            hint={
              consultations.length
                ? 'Try a different name, complaint or date range.'
                : 'Tap the mic to record your first consultation.'
            }
          />
        ) : (
          <div className="space-y-2.5">
            {rows.map((c) => {
              const summary = summaryOf(c);
              return (
                <button
                  key={c.id}
                  onClick={() => onSelectConsultation(c)}
                  className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-4 text-left active:bg-slate-50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center font-bold text-[12px] flex-shrink-0">
                      {initials(c.patientName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-slate-900 text-[15px] truncate">
                        {c.patientName || 'Unknown Patient'}
                      </div>
                      <div className="text-[12px] text-slate-400 mt-0.5 truncate">{c.date}</div>
                    </div>
                    <span
                      className={`flex-shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-lg ${
                        c.status === 'Completed'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {c.status === 'Completed' ? 'Completed' : 'Draft'}
                    </span>
                  </div>
                  {summary && (
                    <p className="text-[13px] text-slate-500 mt-2.5 pl-12 line-clamp-2 leading-snug">{summary}</p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
