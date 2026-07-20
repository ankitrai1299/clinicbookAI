import { useState } from 'react';
import { ShieldAlert, AlertTriangle, ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react';
import type { SafetyAlert } from '../utils/drugSafety';

// Prescribing safety warnings, shown while the doctor edits the treatment plan.
// Advisory only — nothing is blocked, the doctor always decides. Stays hidden
// when there is nothing to flag (the common case).

export default function DrugSafetyAlerts({
  alerts,
  hasPrescription,
}: {
  alerts: SafetyAlert[];
  hasPrescription: boolean;
}) {
  const [open, setOpen] = useState(true);

  // Quiet confirmation once medicines exist and nothing was flagged.
  if (alerts.length === 0) {
    if (!hasPrescription) return null;
    return (
      <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-2.5 text-sm text-emerald-800 flex items-center gap-2">
        <ShieldCheck size={15} className="shrink-0" />
        No allergy conflicts or known interactions found in this prescription.
      </div>
    );
  }

  const critical = alerts.filter((a) => a.severity === 'critical').length;
  const tone = critical > 0
    ? { border: 'border-red-200', bg: 'bg-red-50', head: 'text-red-800', icon: 'text-red-600' }
    : { border: 'border-amber-200', bg: 'bg-amber-50', head: 'text-amber-800', icon: 'text-amber-600' };

  return (
    <div className={`rounded-xl border ${tone.border} ${tone.bg} overflow-hidden`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-2.5 cursor-pointer"
      >
        <span className={`flex items-center gap-2 text-sm font-bold ${tone.head}`}>
          <ShieldAlert size={16} className={tone.icon} />
          {critical > 0
            ? `${critical} prescribing warning${critical === 1 ? '' : 's'} to review`
            : `${alerts.length} prescribing note${alerts.length === 1 ? '' : 's'}`}
        </span>
        {open ? <ChevronUp size={16} className={tone.icon} /> : <ChevronDown size={16} className={tone.icon} />}
      </button>

      {open && (
        <div className="px-4 pb-3 space-y-2">
          {alerts.map((a, i) => {
            const isCritical = a.severity === 'critical';
            return (
              <div
                key={`${a.title}-${i}`}
                className={`flex items-start gap-2.5 rounded-lg bg-white/80 border px-3 py-2 ${
                  isCritical ? 'border-red-100' : 'border-amber-100'
                }`}
              >
                {isCritical ? (
                  <ShieldAlert size={15} className="text-red-600 mt-0.5 shrink-0" />
                ) : (
                  <AlertTriangle size={15} className="text-amber-600 mt-0.5 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    {a.title}
                    <span
                      className={`ml-2 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                        isCritical ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {a.kind}
                    </span>
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{a.detail}</p>
                </div>
              </div>
            );
          })}
          <p className="text-[11px] text-slate-500 pt-1">
            Advisory only — please use your clinical judgement. Nothing is blocked.
          </p>
        </div>
      )}
    </div>
  );
}
