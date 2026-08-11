import React from 'react';
import { Pill, Clock } from 'lucide-react';
import { PrescriptionRecord, Patient } from '../types';
import {
  Avatar,
  Card,
  Chips,
  ScreenHeader,
  SearchBar,
  EmptyState,
  recordTime,
  inRange,
  type RangeKey
} from './ui';

// Prescriptions extracted from finalized consultations.
//
// The badge counts medicines rather than claiming a delivery status: whether a
// prescription reached the patient on WhatsApp is recorded on the send, not on
// this record, and a patient may be relying on the answer.

interface MobilePrescriptionsProps {
  prescriptions: PrescriptionRecord[];
  patients?: Patient[];
  onBack?: () => void;
}

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: 'all', label: 'Any time' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: '7 days' },
  { key: 'month', label: '30 days' }
];

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
        <SearchBar value={query} onChange={setQuery} placeholder="Search patient or medicine…" />
        <Chips value={range} onChange={setRange} options={RANGE_OPTIONS} />
      </div>

      <div className="px-5">
        {rows.length === 0 ? (
          <EmptyState
            icon={<Pill size={26} />}
            title={prescriptions.length ? 'Nothing matches' : 'No prescriptions yet'}
            hint={
              prescriptions.length
                ? 'Try a different name, medicine or period.'
                : 'Finalize a consultation with medicines and it will appear here.'
            }
          />
        ) : (
          <div className="space-y-2.5">
            {rows.map((p) => {
              const count = (p.prescribedMedications || []).length;
              const names = medNames(p);
              return (
                <Card key={p.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <Avatar name={p.patientName} size={40} />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-slate-900 text-[15px] truncate">
                        {p.patientName || 'Unknown Patient'}
                      </div>
                      <div className="text-[12px] text-slate-400 mt-1 flex items-center gap-1.5">
                        <Clock size={12} /> {p.date}
                      </div>
                    </div>
                    <span className="flex-shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-[#EEEFFE] text-[#4A4BD4]">
                      {count} {count === 1 ? 'medicine' : 'medicines'}
                    </span>
                  </div>
                  {(names || p.advice?.length) && (
                    <p className="text-[13px] text-slate-500 mt-2.5 pl-[52px] line-clamp-2 leading-snug">
                      {names || (p.advice || []).join('; ')}
                    </p>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
