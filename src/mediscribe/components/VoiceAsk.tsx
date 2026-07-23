import { useEffect, useRef, useState } from 'react';
import { Mic, X, Loader2, AlertTriangle, Sparkles } from 'lucide-react';
import { askAssistant, transcribeAudio, type AskResult } from '../services/api';

// Ask a question out loud and get an answer from the patient's own records.
//
// WHY PUSH-TO-TALK, AND NEVER A WAKE WORD
// The scribe is already listening to the consultation. A microphone that is
// always waiting for commands cannot tell "shall we start recording" said TO THE
// PATIENT from an instruction meant for the app — and in a consultation room that
// sentence gets said constantly. Holding a button makes the doctor's intent
// unambiguous, and it is the honest choice for a room where a patient is present.
//
// WHY IT IS DISABLED DURING A RECORDING
// The consultation recording owns the microphone. Competing for it mid-visit
// risks the thing that must never break — the recording itself.
//
// The assistant only ever READS. There is deliberately no command that saves,
// sends or books anything: a misheard word costs a re-ask, not a prescription
// delivered to the wrong patient.

const EXAMPLES = [
  'Does this patient have any allergies?',
  'What did I prescribe last time?',
  'Kab aaya tha?',
  'What was the diagnosis?',
  'How many drafts do I have?',
];

interface Props {
  /** The patient on screen, if any — used to resolve "this patient". */
  patientId?: string;
  patientName?: string;
  /** True while a consultation is recording; the mic is unavailable then. */
  recordingInProgress?: boolean;
}

export default function VoiceAsk({ patientId, patientName, recordingInProgress }: Props) {
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<AskResult | null>(null);
  const [error, setError] = useState('');

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  // The doctor's intent, set on press and cleared on release. getUserMedia is
  // async, so a quick tap can release BEFORE the mic finishes opening; without
  // this the mic would open with nobody holding the button and keep recording the
  // room. When the promise resolves we check this flag and, if the doctor has
  // already let go, discard the stream instead of starting a recording.
  const wantsMicRef = useRef(false);
  // Guards against a double-tap issuing two getUserMedia calls (the second would
  // orphan the first stream — a permanently live mic track).
  const openingRef = useRef(false);
  const mountedRef = useRef(true);

  const releaseMic = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  // On unmount: stop wanting the mic, tear down any recorder WITHOUT firing its
  // onstop (which would transcribe ambient audio and call setState on a dead
  // component), and release the device.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      wantsMicRef.current = false;
      const rec = recorderRef.current;
      if (rec) {
        rec.onstop = null;
        rec.ondataavailable = null;
        if (rec.state === 'recording') { try { rec.stop(); } catch { /* already stopped */ } }
        recorderRef.current = null;
      }
      releaseMic();
    };
  }, []);

  // The consultation recording owns the mic. If it starts WHILE we're listening
  // (a second finger on the workspace record button), stand down immediately.
  useEffect(() => {
    if (recordingInProgress && (listening || openingRef.current)) abandonListening();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingInProgress]);

  const run = async (text: string) => {
    setBusy(true);
    setError('');
    try {
      const r = await askAssistant(text, patientId);
      if (mountedRef.current) setResult(r);
    } catch (err) {
      if (mountedRef.current) setError(err instanceof Error ? err.message : 'Could not answer that just now');
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  // Tear the mic down and process NOTHING — used when the doctor cancels (closes
  // the panel, the recording takes over, the component unmounts).
  const abandonListening = () => {
    wantsMicRef.current = false;
    const rec = recorderRef.current;
    if (rec) {
      rec.onstop = null;
      rec.ondataavailable = null;
      if (rec.state === 'recording') { try { rec.stop(); } catch { /* ok */ } }
      recorderRef.current = null;
    }
    releaseMic();
    setListening(false);
  };

  const startListening = async () => {
    if (recordingInProgress || listening || busy || openingRef.current) return;
    wantsMicRef.current = true;
    openingRef.current = true;
    setError('');
    setResult(null);
    setQuestion('');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      openingRef.current = false;
      wantsMicRef.current = false;
      setError('Microphone permission is needed to ask a question.');
      return;
    }
    openingRef.current = false;

    // The doctor released (or cancelled) while the mic was opening, or the
    // consultation grabbed it, or we unmounted — throw the stream away unused.
    if (!wantsMicRef.current || !mountedRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    streamRef.current = stream;
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
    recorder.onstop = async () => {
      releaseMic();
      setListening(false);
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
      if (blob.size < 2000) {
        setError("I didn't hear anything. Hold the button while you speak.");
        return;
      }
      setBusy(true);
      try {
        const { rawText } = await transcribeAudio(blob);
        const text = (rawText || '').trim();
        if (!mountedRef.current) return;
        if (!text) {
          setError("I couldn't make that out. Try again, or type your question.");
          setBusy(false);
          return;
        }
        setQuestion(text);
        await run(text);
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : 'Could not hear that. Try again.');
          setBusy(false);
        }
      }
    };
    recorder.start();
    recorderRef.current = recorder;
    setListening(true);
  };

  // Release means: I let go of the button. If the mic is up, stop it (which
  // transcribes what was said); if it's still opening, cancel so it never starts.
  const stopListening = () => {
    wantsMicRef.current = false;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    else if (!openingRef.current) {
      releaseMic();
      setListening(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Ask about this patient's records"
        className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-40 flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white rounded-full pl-3.5 pr-4 py-3 shadow-lg transition-colors"
      >
        <Sparkles size={16} className="text-sky-300" />
        <span className="text-sm font-semibold">Ask</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-40 w-[min(22rem,calc(100vw-2rem))] bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50">
        <Sparkles size={15} className="text-sky-600" />
        <span className="text-sm font-bold text-slate-800">Ask</span>
        {patientName && (
          <span className="text-[11px] text-slate-500 truncate">· {patientName}</span>
        )}
        <button
          onClick={() => { abandonListening(); setOpen(false); }}
          className="ml-auto text-slate-400 hover:text-slate-600"
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>

      <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
        {recordingInProgress ? (
          <p className="text-[12.5px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 leading-relaxed">
            The consultation is recording, so the microphone is in use. You can still type a question below.
          </p>
        ) : (
          <button
            type="button"
            onMouseDown={() => void startListening()}
            onMouseUp={stopListening}
            onMouseLeave={stopListening}
            onTouchStart={(e) => { e.preventDefault(); void startListening(); }}
            onTouchEnd={(e) => { e.preventDefault(); stopListening(); }}
            disabled={busy}
            className={`w-full flex items-center justify-center gap-2 rounded-xl py-3 font-semibold text-sm transition-colors select-none ${
              listening
                ? 'bg-red-500 text-white'
                : 'bg-slate-900 hover:bg-slate-800 text-white disabled:opacity-60'
            }`}
          >
            <Mic size={16} />
            {listening ? 'Listening — release to ask' : 'Hold to speak'}
          </button>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const text = question.trim();
            if (text && !busy) void run(text);
          }}
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="…or type your question"
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </form>

        {busy && (
          <p className="flex items-center gap-2 text-[12.5px] text-slate-500">
            <Loader2 size={13} className="animate-spin" /> Looking it up…
          </p>
        )}

        {error && (
          <p className="flex items-start gap-1.5 text-[12px] text-amber-700">
            <AlertTriangle size={13} className="mt-px flex-shrink-0" /> <span>{error}</span>
          </p>
        )}

        {result && !busy && (
          <div
            className={`rounded-xl border p-3 ${
              result.isAbsence ? 'bg-amber-50/60 border-amber-100' : 'bg-sky-50/60 border-sky-100'
            }`}
          >
            <p className="text-[13px] text-slate-800 leading-relaxed">{result.answer}</p>

            {/* Two patients with the same first name is exactly the case where a
                guess would be worst, so the doctor chooses. */}
            {result.choices?.length ? (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {result.choices.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setBusy(true);
                      askAssistant(question, c.id)
                        .then(setResult)
                        .catch((err) => setError(err instanceof Error ? err.message : 'Could not answer'))
                        .finally(() => setBusy(false));
                    }}
                    className="text-[11px] font-semibold bg-white border border-slate-200 hover:border-blue-300 hover:text-blue-700 rounded-full px-2.5 py-1 transition-colors"
                  >
                    {c.name}
                    {c.phone ? ` · ${c.phone.slice(-4)}` : ''}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )}

        {!result && !busy && !error && (
          <div className="pt-1">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Try asking</p>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => { setQuestion(ex); void run(ex); }}
                  className="text-[11px] text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-full px-2.5 py-1 transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <p className="px-4 py-2 text-[10px] text-slate-400 border-t border-slate-100 bg-slate-50/60">
        Reads your records only — it never sends, saves or books anything.
      </p>
    </div>
  );
}
