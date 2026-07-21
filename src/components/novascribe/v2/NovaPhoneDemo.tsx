import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'motion/react';
import { Mic, Sparkles, Check, FileText, Pill, Send, ShieldCheck, ChevronLeft, MoreVertical } from 'lucide-react';

// NovaScribe running inside a phone — the same animation used on the landing page
// and for recording vertical footage, so what a doctor sees on the site is exactly
// what goes into a reel.
//
// Plays in beats: mic goes live → the Hinglish transcript lands → the model
// understands → the note fills in → the prescription drops → it's sent. Then loops.

const TRANSCRIPT = [
  { who: 'Doctor', text: 'Bataiye, kya taklif ho rahi hai?' },
  { who: 'Patient', text: 'Do din se gale mein dard hai, bukhar bhi aa raha hai.' },
  { who: 'Doctor', text: 'Khaansi ya saans mein dikkat?' },
  { who: 'Patient', text: 'Halki khaansi hai. Saans theek hai.' },
];

const NOTE = [
  { h: 'Chief complaint', b: 'Sore throat & fever · 2 days, mild cough.' },
  { h: 'Assessment', b: 'Acute pharyngitis, likely viral.' },
];

const RX: [string, string][] = [
  ['Paracetamol 650mg', 'TDS · 3 days'],
  ['Warm saline gargle', 'Twice daily'],
];

const B = { idle: 0, rec: 1, l1: 2, l2: 3, l3: 4, l4: 5, think: 6, note: 7, rx: 8, safe: 9, sent: 10 } as const;
const LAST = B.sent;

const STEPS = [
  { label: 'Record', at: B.rec },
  { label: 'Transcript', at: B.l1 },
  { label: 'Note', at: B.note },
  { label: 'Prescription', at: B.rx },
];

export default function NovaPhoneDemo({
  speed = 1,
  showToasts = true,
  autoPlayInView = true,
}: {
  speed?: number;
  showToasts?: boolean;
  /** On the landing page we only play while visible; when recording, always play. */
  autoPlayInView?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.3 });
  const reduce = useReducedMotion();
  const [beat, setBeat] = useState(0);
  const [secs, setSecs] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const active = autoPlayInView ? inView : true;

  useEffect(() => {
    if (reduce) { setBeat(LAST); return; }
    if (!active) return;
    let cancelled = false;
    const timers: number[] = [];
    const wait = (ms: number) => new Promise<void>((r) => timers.push(window.setTimeout(r, ms / speed)));

    (async () => {
      while (!cancelled) {
        setBeat(0); setSecs(0);
        await wait(700);
        for (let b = 1; b <= LAST && !cancelled; b++) {
          setBeat(b);
          await wait(b === B.think ? 1700 : 1350);
        }
        await wait(2600);
      }
    })();
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [active, speed, reduce]);

  useEffect(() => {
    if (beat < B.rec || beat >= B.think) return;
    const id = setInterval(() => setSecs((s) => s + 1), 1000 / speed);
    return () => clearInterval(id);
  }, [beat, speed]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [beat]);

  const at = (b: number) => beat >= b;
  const recording = beat >= B.rec && beat < B.think;
  const lines = Math.max(0, Math.min(4, beat - B.l1 + 1));
  const showNote = at(B.note);
  const mmss = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;

  return (
    <div ref={ref} className="relative flex justify-center">
      {/* Ambient bloom behind the phone */}
      <div aria-hidden className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <motion.div
          animate={reduce ? undefined : { scale: [1, 1.08, 1], opacity: [0.5, 0.8, 0.5] }}
          transition={reduce ? undefined : { duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          className="w-[320px] h-[320px] rounded-full bg-gradient-to-br from-emerald-200/50 via-sky-200/40 to-violet-200/50 blur-3xl"
        />
      </div>

      {/* Floating outcome cards */}
      {showToasts && (
        <div className="hidden lg:flex flex-col gap-2 absolute -left-6 xl:-left-12 top-16 z-20">
          <AnimatePresence>
            {[
              { at: B.note, icon: FileText, label: 'Note ready', tone: 'text-sky-600 bg-sky-50' },
              { at: B.rx, icon: Pill, label: 'Prescription ready', tone: 'text-violet-600 bg-violet-50' },
              { at: B.sent, icon: Send, label: 'Sent on WhatsApp', tone: 'text-emerald-600 bg-emerald-50' },
            ]
              .filter((t) => at(t.at))
              .map((t, i) => {
                const Icon = t.icon;
                return (
                  <motion.div
                    key={t.label}
                    initial={{ opacity: 0, x: -20, scale: 0.94 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.45, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <motion.div
                      animate={reduce ? undefined : { y: [0, -6, 0] }}
                      transition={reduce ? undefined : { duration: 4.5, repeat: Infinity, ease: 'easeInOut', delay: i * 0.4 }}
                      className="flex items-center gap-2 bg-white/95 backdrop-blur border border-white rounded-xl shadow-xl px-3 py-2"
                    >
                      <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${t.tone}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </span>
                      <span className="text-[11px] font-bold text-slate-800 whitespace-nowrap">{t.label}</span>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    </motion.div>
                  </motion.div>
                );
              })}
          </AnimatePresence>
        </div>
      )}

      {/* Phone */}
      <motion.div
        animate={reduce ? undefined : { y: [0, -8, 0] }}
        transition={reduce ? undefined : { duration: 6.5, repeat: Infinity, ease: 'easeInOut' }}
        className="relative z-10 rounded-[38px] bg-slate-900 p-2.5 shadow-2xl border-[3px] border-slate-800"
      >
        {/* notch */}
        <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-24 h-5 bg-slate-900 rounded-b-2xl z-20" />

        <div className="w-[290px] h-[590px] rounded-[30px] overflow-hidden bg-white flex flex-col">
          {/* App bar */}
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-4 pt-7 pb-3 flex items-center gap-2.5 flex-shrink-0">
            <ChevronLeft className="w-4 h-4 text-white/60" />
            <span className="w-8 h-8 rounded-full bg-sky-500/20 text-sky-300 text-[11px] font-bold flex items-center justify-center">
              PP
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="text-white text-[12px] font-bold truncate">Priya Patel</div>
              <div className="text-slate-400 text-[9px]">34 / F · OPD</div>
            </div>
            <MoreVertical className="w-4 h-4 text-white/60" />
          </div>

          {/* Stage rail */}
          <div className="flex items-center gap-1 px-3 py-2.5 bg-slate-50 border-b border-slate-100 flex-shrink-0">
            {STEPS.map((s) => {
              const done = at(s.at);
              return (
                <div key={s.label} className="flex-1">
                  <div className="h-1 rounded-full bg-slate-200 overflow-hidden">
                    <motion.div
                      initial={{ width: '0%' }}
                      animate={{ width: done ? '100%' : '0%' }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                      className="h-full bg-gradient-to-r from-emerald-500 to-sky-500"
                    />
                  </div>
                  <div className={`text-[8px] font-bold mt-1 text-center transition-colors ${done ? 'text-slate-700' : 'text-slate-300'}`}>
                    {s.label}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-hidden relative">
            <AnimatePresence mode="wait">
              {!showNote ? (
                /* ── Recording + transcript ── */
                <motion.div
                  key="rec"
                  initial={{ opacity: 0, x: -14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -14 }}
                  transition={{ duration: 0.4 }}
                  className="absolute inset-0 flex flex-col p-4"
                >
                  <div className="flex items-center gap-2.5 mb-4">
                    <span className="relative flex-shrink-0">
                      {recording && !reduce && (
                        <motion.span
                          animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                          transition={{ duration: 2, repeat: Infinity }}
                          className="absolute inset-0 rounded-full bg-red-400"
                        />
                      )}
                      <span className={`relative w-10 h-10 rounded-full flex items-center justify-center text-white ${recording ? 'bg-red-500' : 'bg-slate-300'}`}>
                        <Mic className="w-4.5 h-4.5" />
                      </span>
                    </span>
                    <div className="flex items-end gap-[2px] h-7 flex-1">
                      {Array.from({ length: 22 }).map((_, i) => (
                        <motion.span
                          key={i}
                          className={`flex-1 rounded-full ${recording ? 'bg-sky-500' : 'bg-slate-200'}`}
                          animate={recording && !reduce ? { height: [5, 9 + ((i * 7) % 19), 5] } : { height: 5 }}
                          transition={recording && !reduce ? { duration: 0.85, repeat: Infinity, delay: i * 0.04, ease: 'easeInOut' } : undefined}
                        />
                      ))}
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">{mmss}</span>
                  </div>

                  <div ref={scrollRef} className="flex-1 overflow-hidden space-y-3">
                    {TRANSCRIPT.slice(0, lines).map((l, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                        className={`max-w-[88%] rounded-2xl px-3 py-2 ${
                          l.who === 'Doctor'
                            ? 'bg-slate-100 text-slate-800 rounded-tl-sm'
                            : 'bg-emerald-50 text-slate-800 rounded-tr-sm ml-auto'
                        }`}
                      >
                        <div className={`text-[8px] font-bold uppercase tracking-widest mb-0.5 ${l.who === 'Doctor' ? 'text-slate-400' : 'text-emerald-600'}`}>
                          {l.who}
                        </div>
                        <p className="text-[12px] leading-snug">{l.text}</p>
                      </motion.div>
                    ))}

                    {beat === B.think && (
                      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 pt-1">
                        <motion.span
                          animate={reduce ? undefined : { rotate: 360 }}
                          transition={reduce ? undefined : { duration: 3, repeat: Infinity, ease: 'linear' }}
                          className="w-6 h-6 rounded-full bg-violet-50 text-violet-600 flex items-center justify-center"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                        </motion.span>
                        <span className="text-[11px] font-semibold text-slate-500">Understanding the visit…</span>
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              ) : (
                /* ── The note + prescription ── */
                <motion.div
                  key="note"
                  initial={{ opacity: 0, x: 14 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.45 }}
                  className="absolute inset-0 overflow-y-auto p-4 space-y-3 bg-slate-50/40"
                >
                  {NOTE.map((s, i) => (
                    <motion.div
                      key={s.h}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.18, duration: 0.4 }}
                      className="bg-white rounded-xl border border-slate-100 p-3 shadow-sm"
                    >
                      <p className="text-[8px] font-bold uppercase tracking-widest text-sky-600 mb-1">{s.h}</p>
                      <p className="text-[11.5px] text-slate-700 leading-snug">{s.b}</p>
                    </motion.div>
                  ))}

                  {at(B.rx) && (
                    <motion.div
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4 }}
                      className="bg-white rounded-xl border border-slate-100 p-3 shadow-sm"
                    >
                      <p className="text-[8px] font-bold uppercase tracking-widest text-violet-600 mb-1.5">
                        Prescription
                      </p>
                      {RX.map(([d, s], i) => (
                        <motion.div
                          key={d}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.15 + i * 0.15 }}
                          className="flex justify-between gap-2 py-1 border-b border-slate-50 last:border-0"
                        >
                          <span className="text-[11px] font-semibold text-slate-800">{d}</span>
                          <span className="text-[10px] text-slate-400">{s}</span>
                        </motion.div>
                      ))}
                    </motion.div>
                  )}

                  {at(B.safe) && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2"
                    >
                      <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <span className="text-[10.5px] font-semibold text-emerald-700">
                        No allergy or interaction conflicts
                      </span>
                    </motion.div>
                  )}

                  {at(B.sent) && (
                    <motion.div
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ type: 'spring', stiffness: 220, damping: 18 }}
                      className="flex items-center gap-2 bg-slate-900 rounded-xl px-3 py-2.5"
                    >
                      <span className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                        <Send className="w-3.5 h-3.5" />
                      </span>
                      <div className="leading-tight">
                        <div className="text-[11px] font-bold text-white">Sent to patient</div>
                        <div className="text-[9px] text-slate-400">PDF + reminders scheduled</div>
                      </div>
                      <Check className="w-4 h-4 text-emerald-400 ml-auto" />
                    </motion.div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
