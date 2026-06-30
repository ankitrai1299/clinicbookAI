import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Stethoscope, Mic, Square, Upload, FileText, Plus, ArrowLeft,
  Loader2, RefreshCw, AlertTriangle, ClipboardList, ChevronRight,
} from 'lucide-react';

import {
  ConsultationNote, NoteStatus,
  listNotes, createDraft, uploadAudio, transcribe,
} from '../../api/novascribe';
import ConsultationReview from './ConsultationReview';

type View = { name: 'list' } | { name: 'new' } | { name: 'review'; id: string };

const STATUS_STYLES: Record<NoteStatus, { label: string; cls: string }> = {
  AWAITING_AUDIO: { label: 'Awaiting audio', cls: 'bg-slate-100 text-slate-600' },
  PROCESSING: { label: 'Processing', cls: 'bg-amber-100 text-amber-700' },
  DRAFTED: { label: 'AI draft ready', cls: 'bg-sky-100 text-sky-700' },
  REVIEWED: { label: 'Reviewed', cls: 'bg-violet-100 text-violet-700' },
  FINALIZED: { label: 'Finalized', cls: 'bg-emerald-100 text-emerald-700' },
  FAILED: { label: 'Failed', cls: 'bg-red-100 text-red-700' },
};

export function StatusBadge({ status }: { status: NoteStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${s.cls}`}>
      {status === 'PROCESSING' && <Loader2 className="w-3 h-3 animate-spin" />}
      {s.label}
    </span>
  );
}

interface NovaScribeProps {
  clinicName: string;
}

export default function NovaScribe({ clinicName }: NovaScribeProps) {
  const [view, setView] = useState<View>({ name: 'list' });

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Product header */}
      <div className="flex items-center justify-between mb-7">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-sky-500 to-sky-700 flex items-center justify-center text-white shadow-md shadow-sky-100">
            <Stethoscope className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900 leading-tight">
              Nova<span className="text-sky-600">Scribe</span>
            </h1>
            <p className="text-xs font-mono text-slate-400 uppercase tracking-widest">AI Medical Scribe</p>
          </div>
        </div>
        {view.name !== 'new' && (
          <button
            onClick={() => setView({ name: 'new' })}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 text-white text-sm font-semibold shadow-xs shadow-sky-100 hover:bg-sky-700 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" /> New Consultation
          </button>
        )}
      </div>

      {view.name === 'list' && (
        <ConsultationListView onOpen={(id) => setView({ name: 'review', id })} />
      )}
      {view.name === 'new' && (
        <NewConsultationView
          onCancel={() => setView({ name: 'list' })}
          onStarted={(id) => setView({ name: 'review', id })}
        />
      )}
      {view.name === 'review' && (
        <ConsultationReview
          id={view.id}
          clinicName={clinicName}
          onBack={() => setView({ name: 'list' })}
        />
      )}
    </div>
  );
}

/* ───────────────────────── Consultation list ───────────────────────── */

function ConsultationListView({ onOpen }: { onOpen: (id: string) => void }) {
  const [notes, setNotes] = useState<ConsultationNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setNotes(await listNotes());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load consultations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 text-sky-600 animate-spin" /></div>;
  }
  if (error) {
    return (
      <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-red-700 flex items-center gap-3">
        <AlertTriangle className="w-5 h-5" /> {error}
        <button onClick={() => void load()} className="ml-auto text-sm font-semibold underline cursor-pointer">Retry</button>
      </div>
    );
  }
  if (notes.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-14 text-center">
        <ClipboardList className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <h3 className="font-display text-lg font-semibold text-slate-800">No consultations yet</h3>
        <p className="text-sm text-slate-500 mt-1">Start a new consultation — record or upload audio and let the AI draft the note.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <span className="text-sm font-semibold text-slate-700">Recent consultations</span>
        <button onClick={() => void load()} className="text-slate-400 hover:text-sky-600 transition-colors cursor-pointer" title="Refresh">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
      <ul className="divide-y divide-slate-100">
        {notes.map((n) => (
          <li key={n.id}>
            <button
              onClick={() => onOpen(n.id)}
              className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors text-left cursor-pointer"
            >
              <div className="w-9 h-9 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
                <FileText className="w-4.5 h-4.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-800 truncate">{n.patientName || 'Unnamed patient'}</p>
                <p className="text-xs text-slate-400 truncate">
                  {n.assessment ? n.assessment : new Date(n.createdAt).toLocaleString()}
                </p>
              </div>
              <StatusBadge status={n.status} />
              <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ──────────────────────── New consultation ──────────────────────── */

type Mode = 'record' | 'upload' | 'paste';

function NewConsultationView({ onCancel, onStarted }: { onCancel: () => void; onStarted: (id: string) => void }) {
  const [patientName, setPatientName] = useState('');
  const [mode, setMode] = useState<Mode>('record');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // recording state
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // upload / paste
  const [file, setFile] = useState<File | null>(null);
  const [transcriptText, setTranscriptText] = useState('');

  const stopTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        setAudioBlob(new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' }));
        stream.getTracks().forEach((t) => t.stop());
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setError('Microphone access denied. Use Upload or Paste instead.');
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    setRecording(false);
    stopTimer();
  };

  useEffect(() => () => stopTimer(), []);

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const canSubmit =
    !busy &&
    ((mode === 'record' && !!audioBlob) ||
      (mode === 'upload' && !!file) ||
      (mode === 'paste' && transcriptText.trim().length > 0));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const note = await createDraft({ patientName: patientName.trim() || undefined });
      if (mode === 'record' && audioBlob) {
        await uploadAudio(note.id, audioBlob, 'consultation.webm');
      } else if (mode === 'upload' && file) {
        await uploadAudio(note.id, file, file.name);
      } else if (mode === 'paste') {
        await transcribe(note.id, transcriptText.trim());
      }
      onStarted(note.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the consultation');
      setBusy(false);
    }
  };

  const tabCls = (m: Mode) =>
    `flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
      mode === m ? 'bg-sky-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
    }`;

  return (
    <div className="max-w-2xl mx-auto">
      <button onClick={onCancel} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4 cursor-pointer">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        <h2 className="font-display text-xl font-bold text-slate-900 mb-1">New consultation</h2>
        <p className="text-sm text-slate-500 mb-6">Record or upload the consultation — the AI drafts a SOAP note &amp; prescription for you to review.</p>

        <label className="block text-sm font-medium text-slate-700 mb-1.5">Patient name <span className="text-slate-400 font-normal">(optional)</span></label>
        <input
          value={patientName}
          onChange={(e) => setPatientName(e.target.value)}
          placeholder="e.g. Ramesh Kumar"
          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 outline-none mb-6"
        />

        <div className="flex gap-2 mb-6">
          <button className={tabCls('record')} onClick={() => setMode('record')}><Mic className="w-4 h-4" /> Record</button>
          <button className={tabCls('upload')} onClick={() => setMode('upload')}><Upload className="w-4 h-4" /> Upload</button>
          <button className={tabCls('paste')} onClick={() => setMode('paste')}><FileText className="w-4 h-4" /> Transcript</button>
        </div>

        {mode === 'record' && (
          <div className="rounded-2xl bg-slate-50 border border-slate-200 p-8 flex flex-col items-center">
            {!recording && !audioBlob && (
              <button onClick={() => void startRecording()} className="w-20 h-20 rounded-full bg-sky-600 hover:bg-sky-700 text-white flex items-center justify-center shadow-lg shadow-sky-200 transition-all hover:scale-105 cursor-pointer">
                <Mic className="w-8 h-8" />
              </button>
            )}
            {recording && (
              <button onClick={stopRecording} className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg shadow-red-200 transition-all animate-pulse cursor-pointer">
                <Square className="w-7 h-7" />
              </button>
            )}
            {audioBlob && !recording && (
              <div className="flex flex-col items-center gap-3">
                <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center"><Mic className="w-7 h-7" /></div>
                <audio controls src={URL.createObjectURL(audioBlob)} className="h-9" />
                <button onClick={() => { setAudioBlob(null); setSeconds(0); }} className="text-xs text-slate-500 underline cursor-pointer">Re-record</button>
              </div>
            )}
            <p className="mt-4 font-mono text-sm text-slate-500">{recording ? `Recording… ${fmt(seconds)}` : audioBlob ? `Recorded ${fmt(seconds)}` : 'Tap to start recording'}</p>
          </div>
        )}

        {mode === 'upload' && (
          <label className="rounded-2xl bg-slate-50 border-2 border-dashed border-slate-300 p-8 flex flex-col items-center cursor-pointer hover:border-sky-400 transition-colors">
            <Upload className="w-9 h-9 text-slate-400 mb-3" />
            <span className="text-sm font-medium text-slate-700">{file ? file.name : 'Click to choose an audio file'}</span>
            <span className="text-xs text-slate-400 mt-1">webm, mp3, wav, m4a · up to 30 MB</span>
            <input type="file" accept="audio/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        )}

        {mode === 'paste' && (
          <textarea
            value={transcriptText}
            onChange={(e) => setTranscriptText(e.target.value)}
            rows={8}
            placeholder="Paste or type the consultation transcript here…"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 outline-none text-sm"
          />
        )}

        {error && <p className="mt-4 text-sm text-red-600 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> {error}</p>}

        <button
          disabled={!canSubmit}
          onClick={() => void submit()}
          className="mt-6 w-full py-3 rounded-xl bg-sky-600 text-white font-semibold shadow-xs shadow-sky-100 hover:bg-sky-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
        >
          {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Starting…</> : <>Generate AI note <ChevronRight className="w-4 h-4" /></>}
        </button>
      </div>
    </div>
  );
}
