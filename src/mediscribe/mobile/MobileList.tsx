import React from 'react';
import { ChevronLeft, CalendarDays, FileEdit, CheckCircle2, BellRing, Clock, ChevronRight } from 'lucide-react';
import { Consultation } from '../types';
import {
  Avatar,
  Card,
  DateRangeSelect,
  EmptyState,
  StatusBadge,
  recordTime,
  inRange,
  type RangeKey
} from './ui';

// The four dashboard drill-downs behind the metric cards: Consultations, Draft
// Reports, Completed, Pending Follow-ups.
//
// They differ only in what they list, so the header, the period control, the
// count pill and the empty state live here once. Each obeys the SAME period the
// card was showing when it was tapped — otherwise the number and the list behind
// it disagree, which is the one thing a metric card must never do.

export type ListKind = 'today' | 'drafts' | 'completed' | 'follow-ups';

interface MobileListProps {
  kind: ListKind;
  consultations: Consultation[];
  /** The period the dashboard card was showing. */
  range: RangeKey;
  onRangeChange: (r: RangeKey) => void;
  onBack: () => void;
  onSelectConsultation: (c: Consultation) => void;
}

const COPY: Record<ListKind, { title: string; subtitle?: string; emptyTitle: string; emptyBody: string }> = {
  today: {
    title: 'Consultations',
    emptyTitle: 'No consultations in this period',
    emptyBody: 'Try a wider date range, or start a new consultation.'
  },
  drafts: {
    title: 'Draft Reports',
    subtitle: 'not yet completed',
    emptyTitle: 'No drafts in this period',
    emptyBody: 'Every consultation in this range has been completed.'
  },
  completed: {
    title: 'Completed',
    subtitle: 'with a finished report',
    emptyTitle: 'Nothing completed in this period',
    emptyBody: 'Try a wider date range.'
  },
  'follow-ups': {
    title: 'Pending Follow-ups',
    subtitle: 'pending',
    emptyTitle: 'No follow-ups in this period',
    emptyBody: 'Try a wider date range.'
  }
};

const ICONS: Record<ListKind, React.ReactNode> = {
  today: <CalendarDays size={26} />,
  drafts: <FileEdit size={26} />,
  completed: <CheckCircle2 size={26} />,
  'follow-ups': <BellRing size={26} />
};

/** The follow-up date on a note, and whether it has already passed. */
const followUpOf = (c: Consultation): { label: string; overdue: boolean } | null => {
  const raw = c.report?.followUp?.date?.trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    // "review in 2 weeks" — a real commitment we simply cannot place on a
    // calendar. Shown as written rather than dropped or guessed at.
    return { label: raw, overdue: false };
  }
  const today = new Date().setHours(0, 0, 0, 0);
  return {
    label: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }),
    overdue: d.getTime() < today
  };
};

export default function MobileList({
  kind,
  consultations,
  range,
  onRangeChange,
  onBack,
  onSelectConsultation
}: MobileListProps) {
  const copy = COPY[kind];

  const rows = React.useMemo(() => {
    const inPeriod = consultations.filter((c) => inRange(recordTime(c), range));
    const picked =
      kind === 'drafts'
        ? inPeriod.filter((c) => c.status !== 'Completed')
        : kind === 'completed'
          ? inPeriod.filter((c) => c.status === 'Completed')
          : kind === 'follow-ups'
            ? inPeriod.filter((c) => followUpOf(c) !== null)
            : inPeriod;
    return picked.sort((a, b) => recordTime(b) - recordTime(a));
  }, [consultations, kind, range]);

  return (
    <div className="pb-8">
      <div className="px-5 pt-2 pb-3 flex items-center gap-3">
        <button
          onClick={onBack}
          aria-label="Go back"
          className="w-9 h-9 rounded-full bg-white border border-[#E8ECF2] flex items-center justify-center text-slate-700 shadow-[0_1px_6px_rgba(17,24,39,0.04)]"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-[22px] font-bold text-slate-900 tracking-tight truncate">{copy.title}</h1>
          <p className="text-[12px] text-slate-400 mt-0.5 truncate">
            {rows.length} {copy.subtitle ?? 'in this period'}
          </p>
        </div>
        {rows.length > 0 && (
          <span className="bg-[#EEEFFE] text-[#4A4BD4] rounded-full px-3 py-1 text-[13px] font-bold flex-shrink-0">
            {rows.length}
          </span>
        )}
      </div>

      <div className="px-5 mb-1">
        <DateRangeSelect value={range} onChange={onRangeChange} />
      </div>

      <div className="px-5 mt-3 space-y-2.5">
        {rows.length === 0 ? (
          <EmptyState icon={ICONS[kind]} title={copy.emptyTitle} hint={copy.emptyBody} />
        ) : (
          rows.map((c) => {
            const fu = followUpOf(c);
            return (
              <Card key={c.id} className="p-4" onClick={() => onSelectConsultation(c)}>
                <div className="flex items-center gap-3">
                  <Avatar name={c.patientName} size={40} />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-900 text-[15px] truncate">
                      {c.patientName || 'Unknown Patient'}
                    </div>
                    <div className="text-[12px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                      <Clock size={12} /> {c.date}
                    </div>
                  </div>
                  {kind === 'follow-ups' && fu ? (
                    <span
                      className={`flex-shrink-0 text-[11.5px] font-semibold px-2.5 py-1 rounded-full ${
                        fu.overdue ? 'bg-[#FEF2F2] text-[#DC2626]' : 'bg-[#FEF8EB] text-[#B45309]'
                      }`}
                    >
                      {fu.overdue ? 'Overdue' : fu.label}
                    </span>
                  ) : (
                    <StatusBadge status={c.status} />
                  )}
                  <ChevronRight size={18} className="text-slate-300 flex-shrink-0" />
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
