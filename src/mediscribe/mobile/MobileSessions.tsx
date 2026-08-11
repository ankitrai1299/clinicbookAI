import React from 'react';
import { FileText, Sparkles, Check } from 'lucide-react';
import { Consultation, Patient } from '../types';
import { Avatar, Card, SearchBar, EmptyState, recordTime } from './ui';

// Every recorded consultation, as a PIPELINE rather than a list row.
//
// A session moves Recording → Transcript ready → Report ready, and what a doctor
// wants to know at a glance is where each one stopped. A plain status pill says
// "Draft" for a session whose audio failed and for one whose report is a minute
// away — the same word for two completely different situations.
//
// Each stage is read from the record itself, never assumed:
//   Recording        audio was captured, or a transcript exists to prove it did
//   Transcript ready the transcript has actual lines
//   Report ready     a generated report is attached

interface MobileSessionsProps {
  consultations: Consultation[];
  patients?: Patient[];
  onSelectConsultation: (con: Consultation) => void;
  /** Opens the session straight onto its transcript / report tab. */
  onOpenTranscript?: (con: Consultation) => void;
  onOpenReport?: (con: Consultation) => void;
}

const hasTranscript = (c: Consultation): boolean =>
  Array.isArray(c.transcript) && c.transcript.some((l) => (l?.text || '').trim());

const hasReport = (c: Consultation): boolean => {
  const r = c.report as unknown as Record<string, unknown> | undefined;
  return Boolean(r && Object.keys(r).length);
};

const hasRecording = (c: Consultation): boolean =>
  Boolean((c as { audioUrl?: string }).audioUrl) || hasTranscript(c);

/** Duration of the recording, when the record carries one. */
const durationOf = (c: Consultation): string => {
  const secs = (c as { durationSec?: number }).durationSec;
  if (typeof secs !== 'number' || secs <= 0) return '';
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const Stage = ({ label, done, active, last, right }: { label: string; done: boolean; active: boolean; last?: boolean; right?: string }) => (
  <div className="flex items-start gap-2.5">
    <div className="flex flex-col items-center flex-shrink-0">
      <span
        className={`w-[22px] h-[22px] rounded-full flex items-center justify-center ${
          done ? 'bg-[#22C55E] text-white' : active ? 'bg-white border-[3px] border-[#5B5CEB]' : 'bg-white border-2 border-slate-200'
        }`}
      >
        {done && <Check size={13} strokeWidth={3.5} />}
      </span>
      {!last && (
        <span className={`w-[2px] h-6 ${done ? 'bg-[#22C55E]' : 'border-l-2 border-dashed border-slate-200'}`} />
      )}
    </div>
    <div className="flex-1 min-w-0 -mt-0.5 flex items-center justify-between gap-2">
      <span className={`text-[14px] ${done || active ? 'font-semibold text-slate-900' : 'text-slate-400'}`}>{label}</span>
      {right && <span className="text-[12.5px] text-slate-400 flex-shrink-0">{right}</span>}
    </div>
  </div>
);

export default function MobileSessions({
  consultations,
  patients,
  onSelectConsultation,
  onOpenTranscript,
  onOpenReport
}: MobileSessionsProps) {
  const [query, setQuery] = React.useState('');

  const phoneOf = React.useMemo(
    () => new Map((patients ?? []).map((p) => [p.id, p.phone || ''])),
    [patients]
  );

  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return consultations
      .filter((c) => {
        if (!q) return true;
        if ((c.patientName || '').toLowerCase().includes(q)) return true;
        if ((c.date || '').toLowerCase().includes(q)) return true;
        // Only treat the query as a phone number once it is long enough to be
        // one — otherwise "1" would match half the clinic.
        if (digits.length < 3) return false;
        return (phoneOf.get(c.patientId ?? '') || '').replace(/\D/g, '').includes(digits);
      })
      .sort((a, b) => recordTime(b) - recordTime(a));
  }, [consultations, query, phoneOf]);

  return (
    <div className="px-5 pt-4">
      <h1 className="text-[28px] font-bold tracking-tight text-slate-900">Sessions</h1>
      <p className="text-[13.5px] text-slate-500 mt-0.5 mb-4">
        {consultations.length} recorded consultation{consultations.length === 1 ? '' : 's'}
      </p>

      <div className="mb-4">
        <SearchBar value={query} onChange={setQuery} placeholder="Search by patient or date…" />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<FileText size={26} />}
          title={consultations.length ? 'Nothing matches' : 'No sessions yet'}
          hint={consultations.length ? 'Try a patient name or a date.' : 'Record a consultation and it will appear here.'}
        />
      ) : (
        <div className="space-y-3">
          {rows.map((c) => {
            const rec = hasRecording(c);
            const tr = hasTranscript(c);
            const rep = hasReport(c);
            const done = c.status === 'Completed';
            return (
              <Card key={c.id} className="p-4">
                <button onClick={() => onSelectConsultation(c)} className="w-full flex items-center gap-3 text-left mb-3.5">
                  <Avatar name={c.patientName} size={40} />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-900 text-[15px] truncate">
                      {c.patientName || 'Unknown Patient'}
                    </div>
                    <div className="text-[12.5px] text-slate-400 truncate">{c.date}</div>
                  </div>
                  <span
                    className={`flex-shrink-0 inline-flex items-center gap-1.5 text-[11.5px] font-semibold px-2.5 py-1 rounded-lg ${
                      done ? 'bg-[#ECFAF1] text-[#16A34A]' : 'bg-[#FEF8EB] text-[#D97706]'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${done ? 'bg-[#16A34A]' : 'bg-[#D97706]'}`} />
                    {done ? 'Completed' : 'Draft'}
                  </span>
                </button>

                <div className="space-y-0">
                  <Stage label="Recording" done={rec} active={!rec} right={durationOf(c)} />
                  <Stage label="Transcript ready" done={tr} active={rec && !tr} />
                  <Stage label="Report ready" done={rep} active={tr && !rep} last />
                </div>

                {(tr || rep) && (
                  <div className="flex gap-2 mt-3.5">
                    {tr && (
                      <button
                        onClick={() => (onOpenTranscript ?? onSelectConsultation)(c)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#ECFAF1] text-[#16A34A] text-[13px] font-semibold active:opacity-80 transition-opacity"
                      >
                        <FileText size={15} /> Transcript
                      </button>
                    )}
                    {rep && (
                      <button
                        onClick={() => (onOpenReport ?? onSelectConsultation)(c)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#EEEFFE] text-[#4A4BD4] text-[13px] font-semibold active:opacity-80 transition-opacity"
                      >
                        <Sparkles size={15} /> Report
                      </button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
