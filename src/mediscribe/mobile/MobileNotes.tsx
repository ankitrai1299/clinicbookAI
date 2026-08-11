import React from 'react';
import { FileText, Clock, ChevronRight } from 'lucide-react';
import { Consultation, Patient } from '../types';
import {
  Avatar,
  Card,
  Chips,
  ScreenHeader,
  SearchBar,
  StatusBadge,
  EmptyState,
  recordTime,
  inRange,
  type RangeKey
} from './ui';

// Every consultation note this doctor has recorded. Search matches the patient's
// name, the chief complaint, OR their phone number — in a clinic the number is
// often the only thing to hand.

interface MobileNotesProps {
  consultations: Consultation[];
  patients?: Patient[];
  onSelectConsultation: (con: Consultation) => void;
  /** Pre-selects a filter when arriving from a dashboard metric card. */
  initialStatus?: StatusFilter;
  title?: string;
  onBack?: () => void;
}

type StatusFilter = 'all' | 'drafts' | 'completed';

const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'drafts', label: 'Drafts' },
  { key: 'completed', label: 'Completed' }
];

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: 'all', label: 'Any time' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: '7 days' },
  { key: 'month', label: '30 days' }
];

/** The one-line "what was this visit about", straight from the AI note. */
const summaryOf = (c: Consultation): string => {
  const cc = c.report?.chiefComplaint;
  if (Array.isArray(cc) && cc.length) return cc.filter(Boolean).join('; ');
  if (typeof cc === 'string' && cc) return cc;
  return (c.transcript?.find((t) => t?.text?.trim())?.text || '').trim();
};

export default function MobileNotes({
  consultations,
  patients,
  onSelectConsultation,
  initialStatus = 'all',
  title = 'My notes',
  onBack
}: MobileNotesProps) {
  const [query, setQuery] = React.useState('');
  const [status, setStatus] = React.useState<StatusFilter>(initialStatus);
  const [range, setRange] = React.useState<RangeKey>('all');

  // Arriving from a different metric card re-selects that filter.
  React.useEffect(() => setStatus(initialStatus), [initialStatus]);

  const phoneOf = React.useMemo(
    () => new Map((patients ?? []).map((p) => [p.id, p.phone || ''])),
    [patients]
  );

  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return consultations
      .filter((c) => inRange(recordTime(c), range))
      .filter((c) =>
        status === 'all' ? true : status === 'completed' ? c.status === 'Completed' : c.status !== 'Completed'
      )
      .filter((c) => {
        if (!q) return true;
        if ((c.patientName || '').toLowerCase().includes(q)) return true;
        if (summaryOf(c).toLowerCase().includes(q)) return true;
        // Only treat the query as a phone number once it is long enough to be
        // one — otherwise "1" would match half the clinic.
        if (digits.length < 3) return false;
        return (phoneOf.get(c.patientId ?? '') || '').replace(/\D/g, '').includes(digits);
      })
      .sort((a, b) => recordTime(b) - recordTime(a));
  }, [consultations, query, status, range, phoneOf]);

  return (
    <div>
      <ScreenHeader title={title} onBack={onBack} />

      <div className="px-5 space-y-3 mb-4">
        <SearchBar value={query} onChange={setQuery} placeholder="Search name, complaint or phone…" />
        <Chips value={status} onChange={setStatus} options={STATUS_OPTIONS} />
        <Chips value={range} onChange={setRange} options={RANGE_OPTIONS} />
      </div>

      <div className="px-5">
        <p className="text-[12.5px] text-slate-400 mb-3">
          {rows.length} of {consultations.length}
        </p>

        {rows.length === 0 ? (
          <EmptyState
            icon={<FileText size={26} />}
            title={consultations.length ? 'Nothing matches' : 'No notes yet'}
            hint={
              consultations.length
                ? 'Try a different name, complaint or period.'
                : 'Record a consultation and it will appear here.'
            }
          />
        ) : (
          <div className="space-y-2.5">
            {rows.map((c) => {
              const summary = summaryOf(c);
              return (
                <Card key={c.id} className="flex items-center p-3.5" onClick={() => onSelectConsultation(c)}>
                  <Avatar name={c.patientName} size={40} />
                  <div className="flex-1 min-w-0 ml-3">
                    <div className="font-bold text-slate-900 text-[15px] truncate">
                      {c.patientName || 'Unknown Patient'}
                    </div>
                    {summary && <div className="text-[12px] text-slate-500 mt-0.5 truncate">{summary}</div>}
                    <div className="text-[12px] text-slate-400 mt-1 flex items-center gap-1.5">
                      <Clock size={12} /> {c.date}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0 ml-2">
                    <StatusBadge status={c.status} />
                    <ChevronRight size={18} className="text-slate-300" />
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
