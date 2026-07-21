import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'motion/react';
import { Languages as LanguagesIcon, Mic, FileText, MessageSquare } from 'lucide-react';
import { Reveal, SectionHead } from './primitives';
import { ALL_LANGUAGES, SCENES, INDIC_FONT } from './scenes';

// The language section. Doctors in India rarely consult in English, and the single
// biggest objection to an AI scribe is "it won't understand how my patients talk".
// So this section answers it by showing the languages in their OWN script — a wall
// of Devanagari, Tamil, Bengali and Gurmukhi says more than a sentence claiming
// "10 languages supported" ever could.

const PROOF = [
  {
    icon: Mic,
    title: 'Nothing to select',
    body: 'Auto-detect is on by default. The doctor presses record and speaks — Hindi, Tamil, or Hindi and English in the same sentence.',
  },
  {
    icon: FileText,
    title: 'Written in its own script',
    body: 'Hindi comes back in Devanagari, Tamil in Tamil script. Never romanised, so it reads the way your patients actually write.',
  },
  {
    icon: MessageSquare,
    title: 'The record stays standard',
    body: 'The clinical note is filed in English for referrals and insurance, while the patient gets their copy in the language they spoke.',
  },
];

/** The same sentence a patient says, rotating through languages. */
function RotatingLine() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.4 });
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);

  useEffect(() => {
    if (reduce || !inView) return;
    const id = setInterval(() => setI((n) => (n + 1) % SCENES.length), 2800);
    return () => clearInterval(id);
  }, [inView, reduce]);

  const scene = SCENES[i];

  return (
    <div ref={ref} className="rounded-2xl bg-slate-900 p-6 sm:p-7 overflow-hidden">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
          Patient says
        </span>
      </div>

      <div className="min-h-[64px] flex items-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={scene.code}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="text-lg sm:text-xl text-white leading-relaxed"
            style={{ fontFamily: INDIC_FONT }}
          >
            {scene.transcript[1].text}
          </motion.p>
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-2 mt-5 pt-5 border-t border-white/10">
        <LanguagesIcon className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
        <span className="text-[11px] text-slate-400">NovaScribe heard</span>
        <AnimatePresence mode="wait">
          <motion.span
            key={scene.code}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.3 }}
            className="text-[11px] font-bold text-white bg-white/10 rounded-full px-2.5 py-1"
            style={{ fontFamily: INDIC_FONT }}
          >
            {scene.native}
          </motion.span>
        </AnimatePresence>
        <span className="text-[11px] text-slate-500 ml-auto">no language was selected</span>
      </div>
    </div>
  );
}

export default function NovaLanguages() {
  const reduce = useReducedMotion();

  return (
    <section className="py-24 bg-white border-y border-slate-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHead
          eyebrow="Languages"
          title="Your patients don't consult in English."
          accent="NovaScribe doesn't ask them to."
          sub="Ten languages, each transcribed in its own script — with auto-detect, so the doctor never stops to pick one."
        />

        {/* The wall of scripts. Staggered so the eye reads it as one growing set,
            and each tile lifts on hover — it invites you to look for your own. */}
        <Reveal delay={0.1}>
          <div className="mt-14 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {ALL_LANGUAGES.map((l, i) => (
              <motion.div
                key={l.code}
                initial={reduce ? undefined : { opacity: 0, y: 16, scale: 0.96 }}
                whileInView={reduce ? undefined : { opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.45, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                whileHover={reduce ? undefined : { y: -5 }}
                className="group rounded-2xl border border-slate-200 bg-white p-4 text-center hover:border-violet-300 hover:shadow-lg hover:shadow-violet-500/5 transition-colors"
              >
                <div
                  className="text-xl font-bold text-slate-900 group-hover:text-violet-700 transition-colors"
                  style={{ fontFamily: INDIC_FONT }}
                >
                  {l.native}
                </div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mt-1">
                  {l.english}
                </div>
              </motion.div>
            ))}
          </div>
        </Reveal>

        <div className="mt-8 grid lg:grid-cols-2 gap-8 items-start">
          <Reveal delay={0.12}>
            <RotatingLine />
          </Reveal>

          <div className="space-y-4">
            {PROOF.map((p, i) => {
              const Icon = p.icon;
              return (
                <Reveal key={p.title} delay={0.14 + i * 0.08}>
                  <div className="flex gap-4">
                    <span className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4.5 h-4.5" />
                    </span>
                    <div>
                      <h3 className="text-[15px] font-bold text-slate-900">{p.title}</h3>
                      <p className="text-[13.5px] text-slate-600 leading-relaxed mt-1">{p.body}</p>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
