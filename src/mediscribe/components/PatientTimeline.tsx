import React, { useEffect, useState } from 'react';
import {
  UserPlus,
  CalendarPlus,
  CalendarCheck,
  CalendarX,
  Stethoscope,
  FileText,
  Pill,
  FlaskConical,
  CalendarClock,
  RefreshCw,
  MessageSquare,
  Activity,
} from 'lucide-react';
import { TimelineEvent } from '../types';
import { getPatientTimeline } from '../services/api';

// The patient TIMELINE — one chronological, typed stream of everything that has
// happened to this patient across the platform (registered → booked → visited →
// prescribed → …). Read-only; fetched when the patient profile is opened.

type Meta = { icon: typeof Activity; color: string; bg: string };

const META: Record<string, Meta> = {
  registered: { icon: UserPlus, color: 'text-slate-600', bg: 'bg-slate-100' },
  booked: { icon: CalendarPlus, color: 'text-blue-600', bg: 'bg-blue-50' },
  confirmed: { icon: CalendarCheck, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  no_show: { icon: CalendarX, color: 'text-red-600', bg: 'bg-red-50' },
  visited: { icon: Stethoscope, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  note_finalized: { icon: FileText, color: 'text-violet-600', bg: 'bg-violet-50' },
  prescribed: { icon: Pill, color: 'text-teal-600', bg: 'bg-teal-50' },
  lab_ordered: { icon: FlaskConical, color: 'text-amber-600', bg: 'bg-amber-50' },
  follow_up_set: { icon: CalendarClock, color: 'text-sky-600', bg: 'bg-sky-50' },
  refill_due: { icon: RefreshCw, color: 'text-orange-600', bg: 'bg-orange-50' },
  message_in: { icon: MessageSquare, color: 'text-slate-600', bg: 'bg-slate-100' },
  message_out: { icon: MessageSquare, color: 'text-blue-600', bg: 'bg-blue-50' },
};

const fallback: Meta = { icon: Activity, color: 'text-slate-500', bg: 'bg-slate-100' };

// "2h ago" / "3d ago" / "12 Jul" — compact relative label with a full title tooltip.
function relative(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function PatientTimeline({ patientId }: { patientId: string }) {
  const [items, setItems] = useState<TimelineEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setError(null);
    getPatientTimeline(patientId)
      .then((d) => !cancelled && setItems(Array.isArray(d) ? d : []))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Failed to load timeline'));
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Activity size={16} className="text-blue-600" />
        <h3 className="text-base font-bold text-slate-900">Patient Timeline</h3>
      </div>

      {error ? (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">{error}</div>
      ) : !items ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-5 justify-center">
          <span className="w-4 h-4 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
          Loading timeline…
        </div>
      ) : items.length === 0 ? (
        <div className="text-sm text-slate-500 bg-white border border-dashed border-slate-200 rounded-lg px-4 py-6 text-center">
          No activity yet. Events appear here as this patient books, visits and gets prescriptions.
        </div>
      ) : (
        <ol className="relative">
          {/* vertical rail */}
          <span className="absolute left-[15px] top-2 bottom-2 w-px bg-slate-200" aria-hidden="true" />
          {items.map((ev) => {
            const m = META[ev.type] ?? fallback;
            const Icon = m.icon;
            return (
              <li key={ev.id} className="relative flex gap-3 pb-4 last:pb-0">
                <span
                  className={`relative z-10 flex-shrink-0 w-8 h-8 rounded-full ${m.bg} ${m.color} flex items-center justify-center ring-4 ring-slate-50`}
                >
                  <Icon size={15} />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900 truncate">{ev.title}</p>
                    <span className="text-xs text-slate-400 whitespace-nowrap" title={new Date(ev.at).toLocaleString()}>
                      {relative(ev.at)}
                    </span>
                  </div>
                  {ev.detail && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{ev.detail}</p>}
                  {ev.actorName && (
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      by {ev.actorType === 'doctor' ? 'Dr. ' : ''}
                      {ev.actorName}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
