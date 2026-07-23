import { useEffect, useRef, useState } from 'react';
import { Mic, X, Loader2, AlertTriangle, Sparkles, Send, Maximize2, Minimize2, ShieldCheck } from 'lucide-react';
import { askAssistant, transcribeAudio } from '../services/api';

// The doctor's assistant — a chat about their own patients' records.
//
// It began as a one-shot "Ask": a question, an answer, then it reset. This is a
// conversation instead — the thread stays, and a follow-up ("aur uski current
// dawa?") is understood against the patient already being discussed, so the
// doctor doesn't repeat the name every time.
//
// TWO THINGS THAT DO NOT CHANGE, because they are what make it safe to hand a
// clinician:
//   • READ-ONLY. No message can save, send, book or delete. A misheard word costs
//     a re-ask, never a prescription on the wrong patient's phone.
//   • The model only CLASSIFIES a question into a fixed set of intents; every
//     answer is templated from stored records, so it cannot invent a drug, a dose
//     or an allergy. This is a chat UI over the same grounded engine, not an
//     open-ended AI that writes clinical prose.
//
// TAP TO TALK, NOT HOLD, and it stands down entirely while a consultation is
// recording — that recording owns the microphone.

const EXAMPLES = [
  'Does this patient have any allergies?',
  'What did I prescribe last time?',
  'इसको क्या बीमारी थी?',
  'Kab aaya tha?',
  'How many drafts do I have?',
];

const MAX_LISTEN_MS = 15_000;
const SILENCE_MS = 1_800;

type Choice = { id: string; name: string; phone?: string };
type Msg = { role: 'user' | 'assistant'; text: string; isAbsence?: boolean; choices?: Choice[] };

interface Props {
  /** The patient on screen, if any — the default subject of the conversation. */
  patientId?: string;
  patientName?: string;
  /** True while a consultation is recording; the mic is unavailable then. */
  recordingInProgress?: boolean;
  /** Controlled so the sidebar "Assistant" entry can open the same chat. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function VoiceAsk({ patientId, patientName, recordingInProgress, open, onOpenChange }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);

  // The patient the conversation is currently about. It follows whoever was last
  // resolved by name; failing that, the patient open on screen. Reset when the
  // doctor opens a different consultation, so context tracks what they're looking
  // at rather than getting stuck on an earlier patient.
  const [pinnedPatientId, setPinnedPatientId] = useState<string | undefined>(undefined);
  const contextPatientId = pinnedPatientId ?? patientId;
  const lastQuestionRef = useRef('');

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const wantsMicRef = useRef(false);
  const openingRef = useRef(false);
  const mountedRef = useRef(true);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const timersRef = useRef<number[]>([]);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPinnedPatientId(undefined);
  }, [patientId]);

  // Keep the newest message in view.
  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

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

  useEffect(() => {
    if (recordingInProgress && (listening || openingRef.current)) abandonListening();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingInProgress]);

  // Ask, appending both the question and the answer to the thread.
  const send = async (text: string, patientOverride?: string) => {
    const q = text.trim();
    if (!q || busy) return;
    lastQuestionRef.current = q;
    setError('');
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setBusy(true);
    try {
      const r = await askAssistant(q, patientOverride ?? contextPatientId);
      if (!mountedRef.current) return;
      setMessages((m) => [...m, { role: 'assistant', text: r.answer, isAbsence: r.isAbsence, choices: r.choices }]);
      if (r.patient) setPinnedPatientId(r.patient.id);
    } catch (err) {
      if (mountedRef.current) setError(err instanceof Error ? err.message : 'Could not answer that just now');
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  // Disambiguation: the doctor picked which patient they meant. Pin them and
  // re-ask the question that was ambiguous.
  const pickPatient = (c: Choice) => {
    setPinnedPatientId(c.id);
    void send(lastQuestionRef.current || 'summary', c.id);
  };

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
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const d = buf[i] - 128; sum += d * d; }
        const level = Math.sqrt(sum / buf.length);
        const now = Date.now();
        if (level > 6) { spokeAt = now; quietSince = 0; }
        else if (spokeAt && !quietSince) { quietSince = now; }
        if (spokeAt && quietSince && now - quietSince > SILENCE_MS) stopListening();
        if (now - started > MAX_LISTEN_MS) stopListening();
      }, 150);
      timersRef.current.push(id);
    } catch {
      const cap = window.setTimeout(() => stopListening(), MAX_LISTEN_MS);
      timersRef.current.push(cap);
    }
  };

  const toggleListening = async () => {
    if (busy) return;
    if (listening) { stopListening(); return; }
    if (recordingInProgress || openingRef.current) return;

    wantsMicRef.current = true;
    openingRef.current = true;
    setError('');
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
        setBusy(false);
        if (!text) {
          setError("I couldn't make that out. Try again, or type your question.");
          return;
        }
        await send(text);
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : 'Could not hear that. Try again.');
          setBusy(false);
        }
      }
    };
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
    else if (!openingRef.current) { releaseMic(); setListening(false); setElapsed(0); }
  };

  const close = () => { abandonListening(); onOpenChange(false); };

  // Floating launcher when closed.
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        title="Ask about your patients' records"
        className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-40 flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white rounded-full pl-3.5 pr-4 py-3 shadow-lg transition-colors"
      >
        <Sparkles size={16} className="text-sky-300" />
        <span className="text-sm font-semibold">Ask</span>
      </button>
    );
  }

  const shellCls = expanded
    ? 'fixed inset-3 sm:inset-6 md:inset-x-[15%] md:inset-y-8 z-40 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden'
    : 'fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-40 w-[min(24rem,calc(100vw-2rem))] h-[min(34rem,calc(100vh-8rem))] flex flex-col bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden';

  return (
    <div className={shellCls}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50 flex-shrink-0">
        <Sparkles size={15} className="text-sky-600" />
        <span className="text-sm font-bold text-slate-800">Assistant</span>
        {patientName && (
          <span className="text-[11px] text-slate-500 truncate">· {patientName}</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={() => { setMessages([]); setError(''); }}
              className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 px-1.5"
              title="Clear conversation"
            >
              Clear
            </button>
          )}
          <button
            onClick={() => setExpanded((e) => !e)}
            className="text-slate-400 hover:text-slate-600 p-1"
            aria-label={expanded ? 'Shrink' : 'Expand'}
          >
            {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <button onClick={close} className="text-slate-400 hover:text-slate-600 p-1" aria-label="Close">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Thread */}
      <div ref={threadRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-6">
            <div className="w-11 h-11 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center mx-auto mb-3">
              <Sparkles size={20} />
            </div>
            <p className="text-sm font-semibold text-slate-700">Ask about your patients</p>
            <p className="text-[12px] text-slate-500 mt-1 mb-4 leading-relaxed">
              Last visit, prescription, diagnosis, allergies, current medicines — in Hindi or English.
            </p>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => void send(ex)}
                  className="text-[11px] text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-full px-2.5 py-1 transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] bg-slate-900 text-white rounded-2xl rounded-tr-sm px-3 py-2 text-[13px] leading-relaxed">
                {m.text}
              </div>
            </div>
          ) : (
            <div key={i} className="flex justify-start">
              <div
                className={`max-w-[88%] rounded-2xl rounded-tl-sm px-3 py-2 text-[13px] leading-relaxed border ${
                  m.isAbsence ? 'bg-amber-50/70 border-amber-100 text-slate-800' : 'bg-sky-50/70 border-sky-100 text-slate-800'
                }`}
              >
                {m.text}
                {m.choices?.length ? (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {m.choices.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => pickPatient(c)}
                        className="text-[11px] font-semibold bg-white border border-slate-200 hover:border-blue-300 hover:text-blue-700 rounded-full px-2.5 py-1 transition-colors"
                      >
                        {c.name}
                        {c.phone ? ` · ${c.phone.slice(-4)}` : ''}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ),
        )}

        {busy && (
          <div className="flex justify-start">
            <div className="bg-slate-50 border border-slate-100 rounded-2xl rounded-tl-sm px-3 py-2">
              <Loader2 size={14} className="animate-spin text-slate-400" />
            </div>
          </div>
        )}

        {error && (
          <p className="flex items-start gap-1.5 text-[12px] text-amber-700 px-1">
            <AlertTriangle size={13} className="mt-px flex-shrink-0" /> <span>{error}</span>
          </p>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-slate-100 p-3 flex-shrink-0 bg-white">
        <div className="flex items-end gap-2">
          {!recordingInProgress && (
            <button
              type="button"
              onClick={() => void toggleListening()}
              disabled={busy}
              title={listening ? 'Tap to stop' : 'Tap to speak'}
              className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                listening ? 'bg-red-500 text-white' : 'bg-slate-900 hover:bg-slate-800 text-white disabled:opacity-60'
              }`}
            >
              {listening ? (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white/70" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
                </span>
              ) : (
                <Mic size={17} />
              )}
            </button>
          )}

          <form
            className="flex-1 flex items-end gap-2"
            onSubmit={(e) => { e.preventDefault(); void send(input); }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input); }
              }}
              rows={1}
              placeholder={listening ? `Listening… ${elapsed}s` : 'Ask, or tap the mic'}
              className="flex-1 resize-none bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm max-h-24 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="flex-shrink-0 w-10 h-10 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white flex items-center justify-center transition-colors"
              aria-label="Send"
            >
              <Send size={16} />
            </button>
          </form>
        </div>

        <p className="flex items-center gap-1 text-[10px] text-slate-400 mt-2 px-0.5">
          <ShieldCheck size={11} /> Reads your records only — it never sends, saves or books anything.
        </p>
      </div>
    </div>
  );
}
