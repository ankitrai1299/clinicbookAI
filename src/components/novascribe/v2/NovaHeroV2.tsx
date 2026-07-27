import { useEffect, useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'motion/react';
import { ArrowRight, PlayCircle, Mic, FileText, Pill, Send, Check, Sparkles, Stethoscope } from 'lucide-react';
import { Reveal, Waveform } from './primitives';

// Hero. The whole promise in one moving picture: a consultation is spoken, the
// transcript lands, the note writes itself, the prescription appears. A doctor
// should understand the product before reading the headline.

const STAGES = [
  { key: 'listening', label: 'Listening' },
  { key: 'transcript', label: 'Transcribing' },
  { key: 'thinking', label: 'Understanding' },
  { key: 'soap', label: 'Writing note' },
  { key: 'rx', label: 'Prescription' },
] as const;

const TOASTS = [
  { at: 3, icon: FileText, label: 'SOAP ready', tone: 'text-sky-600 bg-sky-50' },
  { at: 4, icon: Pill, label: 'Prescription ready', tone: 'text-violet-600 bg-violet-50' },
  { at: 4, icon: Check, label: 'Saved to records', tone: 'text-emerald-600 bg-emerald-50' },
  { at: 4, icon: Send, label: 'Sent on WhatsApp', tone: 'text-emerald-600 bg-emerald-50' },
];

export default function NovaHeroV2({ isLoggedIn, onOpen }: { isLoggedIn: boolean; onOpen: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.3 });
  const reduce = useReducedMotion();
  const [stage, setStage] = useState(0);

  // The demo advances on its own and loops, but only while it's on screen.
  useEffect(() => {
    if (reduce) { setStage(STAGES.length - 1); return; }
    if (!inView) return;
    const id = setInterval(() => setStage((s) => (s + 1) % (STAGES.length + 1)), 1900);
    return () => clearInterval(id);
  }, [inView, reduce]);

  const at = (n: number) => stage >= n;

  return (
    <section ref={ref} className="relative overflow-hidden bg-white">
      {/* The clinic scene fills the WHOLE hero. The copy side is held on white by
          the scrim so it stays readable; the doctor shows through on the right. */}
      <div aria-hidden className="absolute inset-0">
        <img
          src="/images/doctor-hero.jpg"
          alt=""
          className="w-full h-full object-cover object-[78%_22%]"
        />
        {/* Left→right: solid white under the copy, clearing toward the doctor. */}
        <div className="absolute inset-0 bg-gradient-to-r from-white via-white/95 to-white/45 lg:from-white lg:via-white/88 lg:to-transparent" />
        {/* Gentle top/bottom lift so the section edges melt into the page. */}
        <div className="absolute inset-0 bg-gradient-to-t from-white/90 via-transparent to-white/35" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-20 lg:pt-20 lg:pb-28 grid lg:grid-cols-12 gap-10 items-center">
        {/* Copy */}
        <div className="lg:col-span-6">
          <Reveal>
            <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-3 py-1.5">
              <Stethoscope className="w-3.5 h-3.5" /> AI medical scribe
            </span>
          </Reveal>

          <Reveal delay={0.08}>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-[3.4rem] font-extrabold text-slate-900 tracking-tight leading-[1.05] mt-6">
              Spend time with patients.
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 via-sky-600 to-violet-600">
                Not paperwork.
              </span>
            </h1>
          </Reveal>

          <Reveal delay={0.16}>
            <p className="text-lg text-slate-600 leading-relaxed mt-5 max-w-xl">
              NovaScribe listens to the consultation, understands the medical conversation, and writes the
              clinical note, prescription and patient summary — in seconds.
            </p>
          </Reveal>

          <Reveal delay={0.24}>
            <div className="flex flex-col sm:flex-row gap-3 mt-8">
              <button
                onClick={onOpen}
                className="px-7 py-4 rounded-2xl bg-slate-900 text-white font-bold shadow-lg shadow-slate-900/15 hover:bg-slate-800 transition-all active:scale-[0.98] flex items-center justify-center gap-2 group cursor-pointer"
              >
                {isLoggedIn ? 'Open NovaScribe' : 'Start free trial'}
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
              <a
                href="#live-demo"
                className="px-7 py-4 rounded-2xl bg-white/70 backdrop-blur border border-slate-200 text-slate-700 font-bold hover:bg-white hover:border-slate-300 transition-all flex items-center justify-center gap-2"
              >
                <PlayCircle className="w-4.5 h-4.5 text-emerald-600" />
                Watch 60-second demo
              </a>
            </div>
          </Reveal>

          <Reveal delay={0.32}>
            <div className="flex flex-wrap gap-x-6 gap-y-2 mt-7 text-sm text-slate-500">
              {['Hindi, English & Hinglish', 'Editable before you sign', 'Works on phone & web'].map((t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-emerald-600" /> {t}
                </span>
              ))}
            </div>
          </Reveal>
        </div>

        {/* Over the clinic scene: the live app, and the status rail. The doctor is
            the section background now, so nothing here covers his face. */}
        <div className="lg:col-span-6 relative lg:min-h-[460px]">
          <Reveal delay={0.15} y={40}>
            <>
              {/* The app, floating over the desk — the live consultation. */}
              <motion.div
                animate={reduce ? undefined : { y: [0, -9, 0] }}
                transition={reduce ? undefined : { duration: 7, repeat: Infinity, ease: 'easeInOut' }}
                className="relative mx-auto w-[94%] sm:w-[78%] lg:mx-0 lg:absolute lg:left-0 lg:top-1/2 lg:-translate-y-1/2 lg:w-[66%] rounded-2xl bg-white shadow-2xl shadow-slate-900/25 ring-1 ring-slate-200/70 overflow-hidden"
              >
                {/* chrome */}
                <div className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-50 border-b border-slate-100">
                  <span className="flex gap-1.5">
                    {['bg-red-400', 'bg-amber-400', 'bg-emerald-400'].map((c) => (
                      <span key={c} className={`w-2 h-2 rounded-full ${c}`} />
                    ))}
                  </span>
                  <span className="ml-1 text-[10.5px] font-semibold text-slate-400">NovaScribe — Consultation</span>
                  <span className="ml-auto flex items-center gap-1.5">
                    <motion.span
                      animate={reduce ? undefined : { opacity: [1, 0.35, 1] }}
                      transition={reduce ? undefined : { duration: 1.6, repeat: Infinity }}
                      className="w-1.5 h-1.5 rounded-full bg-red-500"
                    />
                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                      {STAGES[Math.min(stage, STAGES.length - 1)].label}
                    </span>
                  </span>
                </div>

                <div className="p-3.5 space-y-3">
                  {/* mic + waveform */}
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center flex-shrink-0">
                      <Mic className="w-3.5 h-3.5" />
                    </span>
                    <Waveform active={at(0)} className="text-sky-500 h-5" bars={20} />
                    <span className="ml-auto text-[9px] font-mono text-slate-400">02:41</span>
                  </div>

                  {/* transcript */}
                  <div className="space-y-2 min-h-[86px]">
                    {at(1) && (
                      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="max-w-[92%] bg-slate-100 rounded-xl rounded-tl-sm px-2.5 py-1.5">
                        <span className="text-[8px] font-bold uppercase tracking-widest text-slate-400">Doctor</span>
                        <p className="text-[11.5px] text-slate-700 leading-snug">Subah ki dizziness ab kaisi hai?</p>
                      </motion.div>
                    )}
                    {at(2) && (
                      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="max-w-[92%] ml-auto bg-emerald-50 rounded-xl rounded-tr-sm px-2.5 py-1.5">
                        <span className="text-[8px] font-bold uppercase tracking-widest text-emerald-600">Patient</span>
                        <p className="text-[11.5px] text-slate-700 leading-snug">Pehle se kaafi kam hai, ab sirf uthte waqt.</p>
                      </motion.div>
                    )}
                    {stage === 3 && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 pt-0.5">
                        <motion.span
                          animate={reduce ? undefined : { rotate: 360 }}
                          transition={reduce ? undefined : { duration: 3, repeat: Infinity, ease: 'linear' }}
                          className="w-5 h-5 rounded-full bg-violet-50 text-violet-600 flex items-center justify-center"
                        >
                          <Sparkles className="w-3 h-3" />
                        </motion.span>
                        <span className="text-[11px] font-semibold text-slate-500">Understanding the visit…</span>
                      </motion.div>
                    )}
                  </div>

                  {/* the note appearing */}
                  {at(4) && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-xl border border-slate-100 bg-slate-50/60 p-2.5"
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <FileText className="w-3 h-3 text-sky-600" />
                        <span className="text-[8px] font-bold uppercase tracking-widest text-slate-500">Clinical note</span>
                        <span className="ml-auto flex items-center gap-1 text-[9px] font-bold text-emerald-600">
                          <Check className="w-3 h-3" /> SOAP ready
                        </span>
                      </div>
                      <p className="text-[10.5px] text-slate-700 leading-snug">
                        Orthostatic hypotension, secondary to the Lisinopril adjustment.
                      </p>
                      {at(5) && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-wrap gap-1 mt-1.5">
                          {['Lisinopril 5mg — OD', 'BP monitoring'].map((m) => (
                            <span key={m} className="text-[9px] font-semibold bg-violet-50 text-violet-700 border border-violet-100 rounded px-1.5 py-0.5">
                              {m}
                            </span>
                          ))}
                        </motion.div>
                      )}
                    </motion.div>
                  )}
                </div>
              </motion.div>

              {/* Status rail — pinned to the far-right edge, vertically centred so
                  it sits beside the doctor (over his side, never his face) and
                  fills in as the work completes. */}
              <div className="hidden lg:flex flex-col gap-2 absolute right-0 top-1/2 -translate-y-1/2 z-10">
                {TOASTS.map((t, i) => {
                  const Icon = t.icon;
                  const visible = at(t.at);
                  return (
                    <motion.div
                      key={t.label}
                      initial={{ opacity: 0, x: 20, scale: 0.95 }}
                      animate={visible ? { opacity: 1, x: 0, scale: 1 } : { opacity: 0.4, x: 0, scale: 0.97 }}
                      transition={{ duration: 0.45, delay: visible ? i * 0.1 : 0, ease: 'easeOut' }}
                      className="flex items-center gap-2 bg-white/95 backdrop-blur border border-white rounded-xl shadow-xl px-3 py-2"
                    >
                      <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${t.tone}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </span>
                      <span className="text-[11px] font-bold text-slate-800 whitespace-nowrap">{t.label}</span>
                      {visible && <Check className="w-3.5 h-3.5 text-emerald-500" />}
                    </motion.div>
                  );
                })}
              </div>
            </>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
