import { useEffect, useState } from 'react';
import { History, Pill, CalendarClock, Stethoscope, ChevronDown, ChevronUp } from 'lucide-react';
import { ConsultationHistoryItem } from '../types';
import { getPatientHistory } from '../services/api';

// Visit-start snapshot: the 5-second catch-up a doctor needs the moment a
// consultation opens — when they were last seen, what for, what they're currently
// on, and anything pending. Built entirely from the existing patient-history
// endpoint (no new backend), so it costs one call and no new data model.

interface Props {
  patientId: string;
  patientName?: string;
}

const medLine = (m: ConsultationHistoryItem['medicines'][number]): string =>
  [m.medicine, m.strength, m.dose, m.frequency, m.duration].map((s) => (s || '').trim()).filter(Boolean).join(' · ');

function visitLabel(value: string): string {
  if (!value) return 'Unknown date';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  const date = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  if (days <= 0) return `Today · ${date}`;
  if (days === 1) return `Yesterday · ${date}`;
  if (days < 30) return `${days} days ago · ${date}`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? '' : 's'} ago · ${date}`;
}

export default function PatientSnapshot({ patientId, patientName }: Props) {
  const [items, setItems] = useState<ConsultationHistoryItem[] | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    getPatientHistory(patientId, 'desc')
      .then((d) => !cancelled && setItems(Array.isArray(d) ? d : []))
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  // Loading / first-visit states stay quiet — this is context, not a blocker.
  if (!items) return null;
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-sky-100 bg-sky-50/60 px-4 py-2.5 text-sm text-sky-800 flex items-center gap-2">
        <Stethoscope size={15} className="shrink-0" />
        First visit for {patientName || 'this patient'} — no previous records.
      </div>
    );
  }

  const last = items[0];
  const diagnosis = last.diagnosis.filter(Boolean);
  const complaints = last.chiefComplaints.filter(Boolean);
  const meds = last.medicines.filter((m) => (m.medicine || '').trim());
  const followUp = (last.followUp || '').trim();

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-2.5 bg-slate-50/80 hover:bg-slate-100/70 transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <History size={15} className="text-sky-600" />
          Last visit — {visitLabel(last.visitDateTime)}
          <span className="text-xs font-medium text-slate-400">
            · {items.length} visit{items.length === 1 ? '' : 's'}
          </span>
        </span>
        {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
      </button>

      {open && (
        <div className="px-4 py-3 grid sm:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1">
              <Stethoscope size={12} /> Seen for
            </div>
            {diagnosis.length || complaints.length ? (
              <p className="text-slate-700 leading-snug">{(diagnosis.length ? diagnosis : complaints).join('; ')}</p>
            ) : (
              <p className="text-slate-400">Not recorded</p>
            )}
          </div>

          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1">
              <Pill size={12} /> Was prescribed
            </div>
            {meds.length ? (
              <ul className="text-slate-700 leading-snug space-y-0.5">
                {meds.slice(0, 4).map((m, i) => (
                  <li key={i}>{medLine(m)}</li>
                ))}
                {meds.length > 4 && <li className="text-slate-400">+{meds.length - 4} more</li>}
              </ul>
            ) : (
              <p className="text-slate-400">None</p>
            )}
          </div>

          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1">
              <CalendarClock size={12} /> Follow-up
            </div>
            {followUp ? (
              <p className="text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1 leading-snug inline-block">
                {followUp}
              </p>
            ) : (
              <p className="text-slate-400">None pending</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
