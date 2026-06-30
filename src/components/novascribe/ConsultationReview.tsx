import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, Loader2, AlertTriangle, Save, Lock, Printer, Plus, Trash2,
  ShieldCheck, ShieldAlert, ChevronDown, ChevronUp, Pill, CheckCircle2,
} from 'lucide-react';

import {
  ConsultationNote, PrescriptionItem,
  getNote, reviewNote,
} from '../../api/novascribe';
import { StatusBadge } from './NovaScribe';
import { printPrescription } from './printPrescription';

interface Props {
  id: string;
  clinicName: string;
  onBack: () => void;
}

const emptyRx = (): PrescriptionItem => ({ drug: '', dose: '', frequency: '', duration: '', notes: '' });

export default function ConsultationReview({ id, clinicName, onBack }: Props) {
  const [note, setNote] = useState<ConsultationNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // editable local copy
  const [subjective, setSubjective] = useState('');
  const [objective, setObjective] = useState('');
  const [assessment, setAssessment] = useState('');
  const [plan, setPlan] = useState('');
  const [rx, setRx] = useState<PrescriptionItem[]>([]);
  const [showTranscript, setShowTranscript] = useState(false);
  const [saving, setSaving] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hydrate = useCallback((n: ConsultationNote) => {
    setNote(n);
    setSubjective(n.subjective ?? '');
    setObjective(n.objective ?? '');
    setAssessment(n.assessment ?? '');
    setPlan(n.plan ?? '');
    setRx(n.prescription ?? []);
  }, []);

  const load = useCallback(async () => {
    try {
      const n = await getNote(id);
      hydrate(n);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load consultation');
    } finally {
      setLoading(false);
    }
  }, [id, hydrate]);

  useEffect(() => { void load(); }, [load]);

  // Poll while the pipeline is running.
  useEffect(() => {
    const isWorking = note?.status === 'PROCESSING' || note?.status === 'AWAITING_AUDIO';
    if (isWorking && !pollRef.current) {
      pollRef.current = setInterval(() => { void load(); }, 2500);
    }
    if (!isWorking && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [note?.status, load]);

  const save = async (finalize: boolean) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await reviewNote(id, { subjective, objective, assessment, plan, prescription: rx, finalize });
      hydrate(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 text-sky-600 animate-spin" /></div>;
  if (!note) return <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-red-700">{error ?? 'Not found'}</div>;

  const locked = note.status === 'FINALIZED';
  const working = note.status === 'PROCESSING' || note.status === 'AWAITING_AUDIO';

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 cursor-pointer">
          <ArrowLeft className="w-4 h-4" /> All consultations
        </button>
        <StatusBadge status={note.status} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900">{note.patientName || 'Unnamed patient'}</h2>
            <p className="text-xs text-slate-400">{new Date(note.createdAt).toLocaleString()}{note.language ? ` · ${note.language}` : ''}</p>
          </div>
          {(note.status === 'DRAFTED' || note.status === 'REVIEWED' || locked) && (
            <div className="flex items-center gap-2">
              <button onClick={() => printPrescription(note, { clinicName, subjective, objective, assessment, plan, rx })}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
                <Printer className="w-4 h-4" /> Print / PDF
              </button>
              {!locked && (
                <>
                  <button onClick={() => void save(false)} disabled={saving}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer">
                    <Save className="w-4 h-4" /> Save
                  </button>
                  <button onClick={() => void save(true)} disabled={saving}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 cursor-pointer">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />} Finalize
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Working / failed states */}
        {working && (
          <div className="rounded-2xl bg-amber-50 border border-amber-100 p-10 flex flex-col items-center text-center">
            <Loader2 className="w-9 h-9 text-amber-500 animate-spin mb-4" />
            <h3 className="font-display text-lg font-semibold text-slate-800">Transcribing &amp; drafting…</h3>
            <p className="text-sm text-slate-500 mt-1">The AI is listening to the consultation and preparing the note. This updates automatically.</p>
          </div>
        )}
        {note.status === 'FAILED' && (
          <div className="rounded-2xl bg-red-50 border border-red-100 p-6 text-red-700 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
            <div><p className="font-semibold">Processing failed</p><p className="text-sm">{note.errorMessage ?? 'Please try again from a new consultation.'}</p></div>
          </div>
        )}

        {/* Review UI */}
        {!working && note.status !== 'FAILED' && (
          <div className="space-y-5">
            {locked && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm text-emerald-700 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Finalized — this note is locked (read-only).
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-4">
              <SoapField label="Subjective" hint="History & symptoms" value={subjective} onChange={setSubjective} disabled={locked} />
              <SoapField label="Objective" hint="Exam findings" value={objective} onChange={setObjective} disabled={locked} />
              <SoapField label="Assessment" hint="Diagnosis" value={assessment} onChange={setAssessment} disabled={locked} />
              <SoapField label="Plan" hint="Treatment & follow-up" value={plan} onChange={setPlan} disabled={locked} />
            </div>

            {/* Prescription */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Pill className="w-4 h-4 text-sky-600" />
                <h3 className="font-display text-sm font-bold text-slate-800 uppercase tracking-wide">Prescription</h3>
                {rx.some((r) => r.flagged) && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                    <ShieldAlert className="w-3 h-3" /> {rx.filter((r) => r.flagged).length} to verify
                  </span>
                )}
              </div>

              <div className="space-y-2">
                {rx.map((item, i) => (
                  <React.Fragment key={i}>
                    <RxRow item={item} disabled={locked}
                      onChange={(patch) => setRx((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)))}
                      onRemove={() => setRx((prev) => prev.filter((_, j) => j !== i))} />
                  </React.Fragment>
                ))}
                {rx.length === 0 && <p className="text-sm text-slate-400 py-2">No medicines.</p>}
              </div>

              {!locked && (
                <button onClick={() => setRx((prev) => [...prev, emptyRx()])}
                  className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-sky-600 hover:text-sky-700 cursor-pointer">
                  <Plus className="w-4 h-4" /> Add medicine
                </button>
              )}
            </div>

            {/* Transcript */}
            {note.transcript && (
              <div className="rounded-xl border border-slate-200">
                <button onClick={() => setShowTranscript((s) => !s)} className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700 cursor-pointer">
                  Transcript {showTranscript ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {showTranscript && (
                  <pre className="px-4 pb-4 text-xs text-slate-600 whitespace-pre-wrap font-sans leading-relaxed">{note.transcript}</pre>
                )}
              </div>
            )}

            <p className="text-[11px] text-slate-400 flex items-center gap-1.5 pt-1">
              <ShieldCheck className="w-3.5 h-3.5" /> AI-generated draft. Review every field — the doctor is responsible for the final note.
            </p>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function SoapField({ label, hint, value, onChange, disabled }: { label: string; hint: string; value: string; onChange: (v: string) => void; disabled: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3.5">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-sm font-bold text-slate-800">{label}</span>
        <span className="text-[11px] text-slate-400">{hint}</span>
      </div>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} rows={4}
        className="w-full text-sm text-slate-700 outline-none resize-none disabled:bg-transparent disabled:text-slate-600 leading-relaxed" />
    </div>
  );
}

function RxRow({ item, disabled, onChange, onRemove }: { item: PrescriptionItem; disabled: boolean; onChange: (patch: Partial<PrescriptionItem>) => void; onRemove: () => void }) {
  const cell = 'px-2.5 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:bg-transparent';
  return (
    <div className={`rounded-xl border p-2.5 ${item.flagged ? 'border-amber-300 bg-amber-50/50' : 'border-slate-200'}`}>
      <div className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-center">
        <input className={`${cell} sm:col-span-4`} placeholder="Medicine" value={item.drug} disabled={disabled} onChange={(e) => onChange({ drug: e.target.value })} />
        <input className={`${cell} sm:col-span-2`} placeholder="Dose" value={item.dose} disabled={disabled} onChange={(e) => onChange({ dose: e.target.value })} />
        <input className={`${cell} sm:col-span-2`} placeholder="Frequency" value={item.frequency} disabled={disabled} onChange={(e) => onChange({ frequency: e.target.value })} />
        <input className={`${cell} sm:col-span-2`} placeholder="Duration" value={item.duration} disabled={disabled} onChange={(e) => onChange({ duration: e.target.value })} />
        <div className="sm:col-span-2 flex items-center justify-end gap-2">
          {item.flagged && <span title="Not confidently matched / grounded — please verify"><ShieldAlert className="w-4 h-4 text-amber-500" /></span>}
          {!disabled && <button onClick={onRemove} className="text-slate-300 hover:text-red-500 cursor-pointer"><Trash2 className="w-4 h-4" /></button>}
        </div>
      </div>
      {(item.notes || !disabled) && (
        <input className={`${cell} w-full mt-2`} placeholder="Notes (optional)" value={item.notes} disabled={disabled} onChange={(e) => onChange({ notes: e.target.value })} />
      )}
    </div>
  );
}
