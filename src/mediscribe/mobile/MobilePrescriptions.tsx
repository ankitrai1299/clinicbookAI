import React from 'react';
import { Pill } from 'lucide-react';
import { PrescriptionRecord, Patient } from '../types';
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

// Prescriptions extracted from finalized consultations. Same list the web shows,
// laid out for a phone.
//
// The badge counts medicines rather than claiming a delivery status: whether a
// prescription reached the patient on WhatsApp is recorded on the send, not on
// this record, so a "Sent" pill here would be a guess about something a patient
// may be relying on.

interface MobilePrescriptionsProps {
  prescriptions: PrescriptionRecord[];
  patients?: Patient[];
  onBack: () => void;
}

const medNames = (p: PrescriptionRecord): string =>
  (p.prescribedMedications || [])
    .map((m) => m?.medicine)
    .filter(Boolean)
    .join(', ');

export default function MobilePrescriptions({ prescriptions, patients, onBack }: MobilePrescriptionsProps) {
  const [query, setQuery] = React.useState('');
  const [range, setRange] = React.useState<RangeKey>('all');

  const phoneOf = React.useMemo(
    () => new Map((patients ?? []).map((p) => [p.id, p.phone || ''])),
    [patients]
  );

  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return prescriptions
      .filter((p) => inRange(recordTime(p), range))
      .filter((p) => {
        if (!q) return true;
        if ((p.patientName || '').toLowerCase().includes(q)) return true;
        if (medNames(p).toLowerCase().includes(q)) return true;
        if (digits.length < 3) return false;
        return (phoneOf.get(p.patientId ?? '') || '').replace(/\D/g, '').includes(digits);
      })
      .sort((a, b) => recordTime(b) - recordTime(a));
  }, [prescriptions, query, range, phoneOf]);

  return (
    <div>
      <ScreenHeader title="Prescriptions" onBack={onBack} />

      <div className="px-5 space-y-3 mb-4">
        <SearchBar value={query} onChange={setQuery} placeholder="Search prescriptions..." />
        <RangeChips value={range} onChange={setRange} />
      </div>

      <div className="px-5">
        {rows.length === 0 ? (
          <EmptyState
            icon={<Pill size={24} />}
            title={prescriptions.length ? 'Nothing matches' : 'No prescriptions yet'}
            hint={
              prescriptions.length
                ? 'Try a different name, medicine or date range.'
                : 'Finalize a consultation to generate one.'
            }
          />
        ) : (
          <div className="space-y-2.5">
            {rows.map((p) => {
              const count = (p.prescribedMedications || []).length;
              const names = medNames(p);
              return (
                <div key={p.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center font-bold text-[12px] flex-shrink-0">
                      {initials(p.patientName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-slate-900 text-[15px] truncate">
                        {p.patientName || 'Unknown Patient'}
                      </div>
                      <div className="text-[12px] text-slate-400 mt-0.5 truncate">{p.date}</div>
                    </div>
                    <span className="flex-shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-violet-50 text-violet-700">
                      {count} {count === 1 ? 'medicine' : 'medicines'}
                    </span>
                  </div>
                  {(names || p.advice?.length) && (
                    <p className="text-[13px] text-slate-500 mt-2.5 pl-12 line-clamp-2 leading-snug">
                      {names || (p.advice || []).join('; ')}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
