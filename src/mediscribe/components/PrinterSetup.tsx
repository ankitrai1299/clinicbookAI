import { useState } from 'react';
import { Printer, Check, Info, FileText } from 'lucide-react';
import {
  loadPrintSettings,
  savePrintSettings,
  DEFAULT_PRINT_SETTINGS,
  type PrintSettings,
} from '../utils/printSettings';
import { printReport } from '../utils/pdf';
import { createEmptyReport } from '../utils/report';
import { loadDoctorProfile } from '../utils/settings';

// Set up how this clinic's paper prints.
//
// Worth being straight about what this is and isn't: a web app CANNOT open a
// connection to an A4 printer and drive it. That is a browser security boundary,
// not a missing feature — every printer button in every web app ends at the
// operating system's print dialog.
//
// What actually goes wrong in a clinic is not the connection, it's the page:
// our header printed on top of their pre-printed letterhead, the wrong paper
// size clipping content, and eight sheets of clinical record when the patient
// needed four lines of medicine. Those are fixable, so this fixes them — and the
// test print proves the setup before a real patient is waiting.

const CARD = 'bg-white rounded-xl border border-slate-200 p-5';
const LABEL = 'text-[11px] font-bold uppercase tracking-wide text-slate-500';

function Choice<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid sm:grid-cols-2 gap-2 mt-2">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${
            value === o.value
              ? 'border-blue-500 bg-blue-50/60 ring-1 ring-blue-500/20'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center gap-1.5">
            {value === o.value && <Check size={13} className="text-blue-600 flex-shrink-0" />}
            <span className="text-sm font-semibold text-slate-800">{o.label}</span>
          </div>
          {o.hint && <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{o.hint}</p>}
        </button>
      ))}
    </div>
  );
}

export default function PrinterSetup() {
  const [settings, setSettings] = useState<PrintSettings>(() => loadPrintSettings());
  const [saved, setSaved] = useState(false);

  const update = (patch: Partial<PrintSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    savePrintSettings(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  // A test page that exercises the parts people get wrong: the letterhead area,
  // a medicine table, and the signature block.
  const testPrint = () => {
    const profile = loadDoctorProfile();
    const report = createEmptyReport();
    report.assessment = ['Test print — no patient involved.'];
    report.prescribedMedications = [
      {
        ...report.prescribedMedications[0],
        medicine: 'Paracetamol',
        strength: '650mg',
        dose: '1 tablet',
        route: 'Oral',
        frequency: 'TDS',
        timing: 'After food',
        duration: '3 days',
        instructions: 'If fever persists, review.',
        purpose: '',
        compliance: '',
      },
    ];
    report.advice = ['If the layout below sits correctly on your paper, you are set up.'];
    printReport(report, {
      patientName: 'Test Page',
      date: new Date().toISOString().slice(0, 10),
      doctorName: profile.name || undefined,
      doctorQualification: profile.qualification || undefined,
      doctorRegNo: profile.regNo || undefined,
      clinicName: profile.clinicName || undefined,
    });
  };

  const preprinted = settings.letterhead === 'preprinted';

  return (
    <div className="space-y-4">
      <div className={CARD}>
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center flex-shrink-0">
            <Printer size={17} />
          </span>
          <div className="min-w-0">
            <h3 className="font-bold text-slate-900">Printing</h3>
            <p className="text-[13px] text-slate-600 mt-0.5 leading-relaxed">
              Set this up once so prescriptions come out right on your paper.
            </p>
          </div>
          {saved && (
            <span className="ml-auto flex items-center gap-1 text-[11px] font-bold text-emerald-700">
              <Check size={13} /> Saved
            </span>
          )}
        </div>

        {/* The honest bit. A doctor who expects a Connect button should learn why
            there isn't one from us, not from twenty minutes of trying. */}
        <div className="flex gap-2.5 mt-4 rounded-lg bg-slate-50 border border-slate-200 p-3">
          <Info size={15} className="text-slate-400 flex-shrink-0 mt-px" />
          <p className="text-[12px] text-slate-600 leading-relaxed">
            Printing always goes through your computer's own print dialog — no website can connect
            to an A4 printer directly. Set your clinic printer as the <strong>default</strong> in
            Windows, and printing becomes: <strong>Print → Enter</strong>.
          </p>
        </div>
      </div>

      <div className={CARD}>
        <span className={LABEL}>Your paper</span>
        <Choice
          value={settings.letterhead}
          onChange={v => update({ letterhead: v })}
          options={[
            {
              value: 'print',
              label: 'Plain paper',
              hint: 'We print your clinic name and doctor details at the top.',
            },
            {
              value: 'preprinted',
              label: 'Pre-printed letterhead',
              hint: 'Your paper already has the header. We leave that area blank.',
            },
          ]}
        />

        {preprinted && (
          <div className="mt-4">
            <div className="flex items-baseline justify-between">
              <span className={LABEL}>Blank space at the top</span>
              <span className="text-sm font-bold text-slate-800 tabular-nums">
                {settings.topOffsetMm} mm
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={settings.topOffsetMm}
              onChange={e => update({ topOffsetMm: Number(e.target.value) })}
              className="w-full mt-2 accent-blue-600"
            />
            <p className="text-[11px] text-slate-500 mt-1 leading-snug">
              Measure your letterhead from the top of the sheet to just below the printed header,
              then run a test print to confirm. Only the first page is shifted — a second page
              starts at the top like any other sheet.
            </p>
          </div>
        )}
      </div>

      <div className={CARD}>
        <span className={LABEL}>Paper size</span>
        <Choice
          value={settings.paper}
          onChange={v => update({ paper: v })}
          options={[
            { value: 'A4', label: 'A4', hint: 'Standard in India and most of the world.' },
            { value: 'Letter', label: 'Letter', hint: 'US / Canada size.' },
          ]}
        />

        <div className="mt-4">
          <span className={LABEL}>Margins</span>
          <Choice
            value={settings.margin}
            onChange={v => update({ margin: v })}
            options={[
              { value: 'normal', label: 'Normal', hint: 'Safe on every printer.' },
              { value: 'narrow', label: 'Narrow', hint: 'Fits more per page.' },
            ]}
          />
        </div>
      </div>

      <div className={CARD}>
        <span className={LABEL}>What the Print button sends</span>
        <Choice
          value={settings.scope}
          onChange={v => update({ scope: v })}
          options={[
            {
              value: 'prescription',
              label: 'Prescription only',
              hint: 'Diagnosis, medicines, advice and follow-up — usually one page.',
            },
            {
              value: 'full',
              label: 'Full clinical report',
              hint: 'Every section of the record. Several pages.',
            },
          ]}
        />
        <p className="text-[11px] text-slate-500 mt-2 leading-snug">
          Whichever you pick, the other is still one click away in the consultation.
        </p>
      </div>

      <div className={CARD}>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={testPrint}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            <FileText size={15} /> Print a test page
          </button>
          <button
            type="button"
            onClick={() => update({ ...DEFAULT_PRINT_SETTINGS })}
            className="text-xs font-semibold text-slate-500 hover:text-slate-700"
          >
            Reset to defaults
          </button>
        </div>
        <p className="text-[11px] text-slate-500 mt-2.5 leading-snug">
          Prints a sample prescription with no patient on it. Hold it against your letterhead to
          check the spacing before a real patient is waiting.
        </p>
      </div>
    </div>
  );
}
