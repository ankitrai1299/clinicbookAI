import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Mic, Sparkles, Check, FileText, Pill, Send, ShieldCheck, Clock } from 'lucide-react';

// The doctor-side counterpart to the WhatsApp demo: a looping, screen-recordable
// animation of NovaScribe actually working — the consultation is spoken, the
// transcript lands, the note writes itself, the prescription fills in and goes to
// the patient. Same capture-frame approach so the footage comes out clean.
//
//   /demo/novascribe               16:9  — website, YouTube, decks
//   /demo/novascribe?format=9x16   9:16  — Reels / Status
//   /demo/novascribe?speed=1.5     faster or slower
//
// Press H to hide the surrounding chrome before recording.

const TRANSCRIPT = [
  { who: 'Doctor', text: 'Bataiye, kya taklif ho rahi hai?' },
  { who: 'Patient', text: 'Do din se gale mein dard hai, aur bukhar bhi aa raha hai.' },
  { who: 'Doctor', text: 'Khaansi ya saans mein koi dikkat?' },
  { who: 'Patient', text: 'Halki khaansi hai. Saans bilkul theek hai.' },
];

const NOTE = [
  { h: 'Chief complaint', b: 'Sore throat and fever for 2 days, with mild cough.' },
  { h: 'Assessment', b: 'Acute pharyngitis, likely viral. No respiratory distress.' },
];

const RX: [string, string][] = [
  ['Paracetamol 650mg', 'TDS · 3 days · after food'],
  ['Warm saline gargle', 'Twice daily · 5 days'],
];

const FORMATS: Record<string, { w: number; h: number; label: string }> = {
  '16x9': { w: 1280, h: 720, label: '16:9 — website / YouTube' },
  '9x16': { w: 405, h: 720, label: '9:16 — Reels / Status' },
  '1x1': { w: 720, h: 720, label: '1:1 — feed post' },
};

// Timeline of the demo, in "beats".
const BEATS = {
  idle: 0,
  recording: 1,
  line1: 2,
  line2: 3,
  line3: 4,
  line4: 5,
  thinking: 6,
  note: 7,
  rx: 8,
  safety: 9,
  sent: 10,
} as const;
const LAST = BEATS.sent;

export default function NovaScribeDemo() {
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const format = FORMATS[params.get('format') ?? '16x9'] ?? FORMATS['16x9'];
  const speed = Math.max(0.4, Math.min(3, Number(params.get('speed')) || 1));
  const reduce = useReducedMotion();

  const [beat, setBeat] = useState(0);
  const [chrome, setChrome] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key.toLowerCase() === 'h') setChrome((c) => !c); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Drive the beats, then hold and loop.
  useEffect(() => {
    if (reduce) { setBeat(LAST); return; }
    let cancelled = false;
    const timers: number[] = [];
    const wait = (ms: number) => new Promise<void>((r) => timers.push(window.setTimeout(r, ms / speed)));

    (async () => {
      while (!cancelled) {
        setBeat(0);
        setElapsed(0);
        await wait(800);
        for (let b = 1; b <= LAST && !cancelled; b++) {
          setBeat(b);
          // transcript lines land quicker than the "AI" beats
          await wait(b >= BEATS.line1 && b <= BEATS.line4 ? 1500 : b === BEATS.thinking ? 1800 : 1500);
        }
        await wait(2800);
      }
    })();

    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [speed, reduce]);

  // Recording timer ticks while the mic is live.
  useEffect(() => {
    if (beat < BEATS.recording || beat >= BEATS.thinking) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000 / speed);
    return () => clearInterval(id);
  }, [beat, speed]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [beat]);

  const at = (b: number) => beat >= b;
  const recording = beat >= BEATS.recording && beat < BEATS.thinking;
  const linesShown = Math.max(0, Math.min(4, beat - BEATS.line1 + 1));
  const isTall = format.h > format.w;
  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;

  const statusLabel = !at(BEATS.recording)
    ? 'Ready'
    : recording
      ? 'Recording'
      : beat === BEATS.thinking
        ? 'Understanding'
        : at(BEATS.sent)
          ? 'Sent'
          : 'Writing note';

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-sky-50 via-white to-violet-50 flex flex-col items-center justify-center p-6">
      {chrome && (
        <div className="text-center mb-5">
          <p className="text-sm font-bold text-slate-700">Screen-record this area →  {format.label}</p>
          <p className="text-xs text-slate-400 mt-1">
            Press <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px]">H</kbd> to hide this text ·
            add <code className="text-[10px]">?format=9x16</code> for Reels · <code className="text-[10px]">?speed=1.5</code> to speed up
          </p>
        </div>
      )}

      <div
        style={{ width: format.w, height: format.h }}
        className="relative max-w-full rounded-2xl overflow-hidden shadow-2xl bg-gradient-to-br from-sky-100 via-white to-violet-100 flex items-center justify-center p-6"
      >
        <div className="absolute -top-16 -left-10 w-72 h-72 rounded-full bg-emerald-200/40 blur-3xl" />
        <div className="absolute -bottom-16 -right-10 w-72 h-72 rounded-full bg-violet-200/40 blur-3xl" />

        <div className={`relative w-full flex items-center gap-8 ${isTall ? 'flex-col gap-4' : ''}`}>
          {/* Caption rail — only where there's width for it */}
          {!isTall && (
            <div className="w-[280px] flex-shrink-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-700 mb-3">
                NovaScribe
              </div>
              <h2 className="font-display text-3xl font-extrabold text-slate-900 leading-tight">
                Just talk. The note writes itself.
              </h2>
              <p className="text-slate-600 mt-3 leading-relaxed text-[15px]">
                Record the consultation in Hindi, English or Hinglish. The clinical note and prescription are
                ready before the patient stands up.
              </p>
            </div>
          )}

          {/* App window */}
          <div className="flex-1 min-w-0 rounded-2xl bg-slate-900 p-2 shadow-2xl">
            <div className="rounded-xl bg-white overflow-hidden">
              {/* Chrome */}
              <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                <span className="flex gap-1.5">
                  {['bg-red-400', 'bg-amber-400', 'bg-emerald-400'].map((c) => (
                    <span key={c} className={`w-2.5 h-2.5 rounded-full ${c}`} />
                  ))}
                </span>
                <span className="ml-2 text-[11px] font-semibold text-slate-400">
                  NovaScribe — Priya Patel, 34/F
                </span>
                <span className="ml-auto flex items-center gap-1.5">
                  {recording && (
                    <motion.span
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ duration: 1.4, repeat: Infinity }}
                      className="w-2 h-2 rounded-full bg-red-500"
                    />
                  )}
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    {statusLabel}
                  </span>
                </span>
              </div>

              <div className={`grid ${isTall ? '' : 'sm:grid-cols-2'}`} style={{ minHeight: isTall ? 380 : 400 }}>
                {/* Left — mic + transcript */}
                <div className={`p-4 ${isTall ? 'border-b' : 'sm:border-r'} border-slate-100`}>
                  <div className="flex items-center gap-3 mb-4">
                    <span className="relative flex-shrink-0">
                      {recording && (
                        <motion.span
                          animate={{ scale: [1, 1.45, 1], opacity: [0.45, 0, 0.45] }}
                          transition={{ duration: 2, repeat: Infinity }}
                          className="absolute inset-0 rounded-full bg-red-400"
                        />
                      )}
                      <span
                        className={`relative w-9 h-9 rounded-full flex items-center justify-center text-white ${
                          recording ? 'bg-red-500' : 'bg-slate-300'
                        }`}
                      >
                        <Mic className="w-4 h-4" />
                      </span>
                    </span>

                    <div className="flex items-end gap-[3px] h-6 flex-1">
                      {Array.from({ length: 26 }).map((_, i) => (
                        <motion.span
                          key={i}
                          className={`w-[3px] rounded-full ${recording ? 'bg-sky-500' : 'bg-slate-200'}`}
                          animate={recording ? { height: [5, 8 + ((i * 7) % 18), 5] } : { height: 5 }}
                          transition={recording ? { duration: 0.9, repeat: Infinity, delay: i * 0.04, ease: 'easeInOut' } : undefined}
                        />
                      ))}
                    </div>

                    <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {mmss}
                    </span>
                  </div>

                  <div ref={scrollRef} className="space-y-3 overflow-hidden" style={{ maxHeight: isTall ? 150 : 300 }}>
                    <AnimatePresence initial={false}>
                      {TRANSCRIPT.slice(0, linesShown).map((l, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.35 }}
                          className="space-y-0.5"
                        >
                          <span
                            className={`text-[9px] font-bold uppercase tracking-widest ${
                              l.who === 'Doctor' ? 'text-slate-400' : 'text-emerald-600'
                            }`}
                          >
                            {l.who}
                          </span>
                          <p className="text-[12px] text-slate-700 leading-snug">{l.text}</p>
                        </motion.div>
                      ))}
                    </AnimatePresence>

                    {beat === BEATS.thinking && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 pt-1">
                        <motion.span
                          animate={{ rotate: 360 }}
                          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                          className="w-5 h-5 rounded-full bg-violet-50 text-violet-600 flex items-center justify-center"
                        >
                          <Sparkles className="w-3 h-3" />
                        </motion.span>
                        <span className="text-[11px] font-semibold text-slate-500">
                          Understanding symptoms &amp; duration…
                        </span>
                      </motion.div>
                    )}
                  </div>
                </div>

                {/* Right — the output */}
                <div className="p-4 bg-slate-50/60 space-y-2.5">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                    Clinical note
                  </span>

                  {NOTE.map((s, i) => (
                    <div key={s.h}>
                      <p className="text-[9px] font-bold uppercase tracking-wide text-sky-600 mb-1">{s.h}</p>
                      {at(BEATS.note) ? (
                        <motion.p
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.2 }}
                          className="text-[11px] text-slate-700 leading-snug bg-white rounded-lg border border-slate-100 p-2"
                        >
                          {s.b}
                        </motion.p>
                      ) : (
                        <div className="h-9 rounded-lg bg-slate-200/70 animate-pulse" />
                      )}
                    </div>
                  ))}

                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wide text-violet-600 mb-1">
                      Prescription
                    </p>
                    {at(BEATS.rx) ? (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white rounded-lg border border-slate-100 p-2 space-y-1"
                      >
                        {RX.map(([d, s], i) => (
                          <motion.div
                            key={d}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.15 + i * 0.15 }}
                            className="flex justify-between gap-2 text-[10px]"
                          >
                            <span className="font-semibold text-slate-800">{d}</span>
                            <span className="text-slate-400 text-right">{s}</span>
                          </motion.div>
                        ))}
                      </motion.div>
                    ) : (
                      <div className="h-12 rounded-lg bg-slate-200/70 animate-pulse" />
                    )}
                  </div>

                  <AnimatePresence>
                    {at(BEATS.safety) && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-100 rounded-lg px-2 py-1.5"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                        <span className="text-[10px] font-semibold text-emerald-700">
                          No allergy or interaction conflicts
                        </span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Outcome toasts */}
        <div className="absolute right-5 bottom-5 flex flex-col gap-2 items-end">
          <AnimatePresence>
            {[
              { at: BEATS.note, icon: FileText, label: 'Note ready', tone: 'text-sky-600 bg-sky-50' },
              { at: BEATS.rx, icon: Pill, label: 'Prescription ready', tone: 'text-violet-600 bg-violet-50' },
              { at: BEATS.sent, icon: Send, label: 'Sent on WhatsApp', tone: 'text-emerald-600 bg-emerald-50' },
            ]
              .filter((t) => at(t.at))
              .map((t, i) => {
                const Icon = t.icon;
                return (
                  <motion.div
                    key={t.label}
                    initial={{ opacity: 0, x: 24, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 24 }}
                    transition={{ duration: 0.4, delay: i * 0.05 }}
                    className="flex items-center gap-2 bg-white/95 backdrop-blur border border-white rounded-xl shadow-xl px-3 py-2"
                  >
                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center ${t.tone}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-[11px] font-bold text-slate-800 whitespace-nowrap">{t.label}</span>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  </motion.div>
                );
              })}
          </AnimatePresence>
        </div>
      </div>

      {chrome && (
        <div className="flex flex-wrap justify-center gap-2 mt-5">
          {Object.entries(FORMATS).map(([k, f]) => (
            <a
              key={k}
              href={`?format=${k}`}
              className={`text-xs font-bold rounded-full px-4 py-2 border transition-colors ${
                f === format
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              {f.label}
            </a>
          ))}
          <a
            href="/demo"
            className="text-xs font-bold rounded-full px-4 py-2 border bg-white text-emerald-700 border-emerald-200 hover:border-emerald-300"
          >
            ← ClinicBook demo
          </a>
        </div>
      )}
    </div>
  );
}
