import { useEffect, useRef, useState } from 'react';
import { Mic, X, Loader2, AlertTriangle, Sparkles } from 'lucide-react';
import { askAssistant, transcribeAudio, type AskResult } from '../services/api';

// Ask a question out loud and get an answer from the patient's own records.
//
// TAP TO START, TAP TO STOP — NOT HOLD, AND NEVER A WAKE WORD
// The first version made you HOLD the button while speaking. On a phone that is
// genuinely awkward: you have to keep a finger pinned down, a slight drag cancels
// it, and a WebView doesn't report press-and-hold reliably — so questions got cut
// off and half-heard. A tap to start and a tap to stop is far steadier on touch,
// and it still takes a deliberate press to begin, which is the point: the scribe
// is already listening to the consultation, and a wake word can't tell "shall we
// start recording" said TO THE PATIENT from a command. An explicit tap can.
//
// A silence detector stops it automatically when the doctor finishes speaking, and
// a hard cap stops it regardless — so a mic can never be left open in the room.
//
// WHY IT STANDS DOWN DURING A CONSULTATION RECORDING
// That recording owns the microphone; competing for it mid-visit risks the one
// thing that must never break.
//
// The assistant only ever READS. There is deliberately no command that saves,
// sends or books anything: a misheard word costs a re-ask, not a prescription
// delivered to the wrong patient.

// Stop automatically after this long even if the doctor never taps stop — a mic
// must never be left live in a consultation room.
const MAX_LISTEN_MS = 15_000;
// Stop this long after speech drops to silence — natural end of a question.
const SILENCE_MS = 1_800;

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
  // getUserMedia is async: a tap can start AND stop before the mic finishes
  // opening. When the promise resolves we check this flag; if the doctor already
  // stopped, we discard the stream rather than opening a mic nobody asked for.
  const wantsMicRef = useRef(false);
  const openingRef = useRef(false);
  const mountedRef = useRef(true);
  // Silence detection + the hard cap, so the mic is never left live.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const timersRef = useRef<number[]>([]);
  const [elapsed, setElapsed] = useState(0);

  const clearTimers = () => {
    timersRef.current.forEach((t) => clearInterval(t));
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
  };

  const releaseMic = () => {
    clearTimers();
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

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

  // The consultation recording owns the mic. If it starts while we're listening,
  // stand down immediately.
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

  // Tear the mic down and process NOTHING — used when the doctor cancels.
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
    setElapsed(0);
  };

  // Watch the mic level; auto-stop once the doctor has spoken and then gone quiet.
  const watchForSilence = (stream: MediaStream) => {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      let spokeAt = 0;
      let quietSince = 0;
      const started = Date.now();

      const id = window.setInterval(() => {
        analyser.getByteTimeDomainData(buf);
        // RMS deviation from the 128 midpoint — a cheap "is there sound" measure.
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const d = buf[i] - 128;
          sum += d * d;
        }
        const level = Math.sqrt(sum / buf.length);
        const now = Date.now();

        if (level > 6) {
          spokeAt = now;
          quietSince = 0;
        } else if (spokeAt && !quietSince) {
          quietSince = now;
        }
        // Only end on silence AFTER the doctor has actually said something, so it
        // doesn't cut off before they begin.
        if (spokeAt && quietSince && now - quietSince > SILENCE_MS) stopListening();
        if (now - started > MAX_LISTEN_MS) stopListening();
      }, 150);
      timersRef.current.push(id);
    } catch {
      // No analyser (older WebView) — the hard cap below still protects us.
      const cap = window.setTimeout(() => stopListening(), MAX_LISTEN_MS);
      timersRef.current.push(cap);
    }
  };

  // Tap to start. Tap again (or silence / the cap) to stop and ask.
  const toggleListening = async () => {
    if (busy) return;
    if (listening) { stopListening(); return; }
    if (recordingInProgress || openingRef.current) return;

    wantsMicRef.current = true;
    openingRef.current = true;
    setError('');
    setResult(null);
    setQuestion('');
    setElapsed(0);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      openingRef.current = false;
      wantsMicRef.current = false;
      setError('Microphone permission is needed. Allow it in your settings and try again.');
      return;
    }
    openingRef.current = false;

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
      setElapsed(0);
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
      if (blob.size < 2000) {
        setError("I didn't catch anything. Tap to start, speak, then tap to stop.");
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
    // Timeslice so a chunk is emitted periodically — some WebViews otherwise emit
    // nothing until stop, and a race there can lose the whole clip.
    recorder.start(250);
    recorderRef.current = recorder;
    setListening(true);

    const tick = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    timersRef.current.push(tick);
    watchForSilence(stream);
  };

  const stopListening = () => {
    wantsMicRef.current = false;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    else if (!openingRef.current) {
      releaseMic();
      setListening(false);
      setElapsed(0);
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
            onClick={() => void toggleListening()}
            disabled={busy}
            className={`w-full flex items-center justify-center gap-2 rounded-xl py-3.5 font-semibold text-sm transition-colors select-none ${
              listening
                ? 'bg-red-500 text-white'
                : 'bg-slate-900 hover:bg-slate-800 text-white disabled:opacity-60'
            }`}
          >
            {listening ? (
              <>
                {/* Pulsing dot + running timer, so it's obvious the mic is live
                    and how long it's been recording. */}
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white/70" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
                </span>
                Listening… {elapsed}s · tap to stop
              </>
            ) : (
              <>
                <Mic size={16} /> Tap to speak
              </>
            )}
          </button>
        )}

        {listening && (
          <p className="text-[11px] text-slate-500 text-center -mt-1">
            Ask your question, then stop — or just pause and it stops on its own.
          </p>
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
