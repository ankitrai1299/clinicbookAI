import { motion, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react';
import { useRef } from 'react';
import {
  Mic, FileText, Brain, ClipboardList, Pill, MessageSquare, Database, Send,
  Clock, Search, Keyboard, FolderOpen, Check, ArrowRight,
} from 'lucide-react';
import { Reveal, SectionHead, Stagger, staggerItem } from './primitives';

// Sections 2, 4 and 5: how the work flows, what it replaces, and how the model
// actually reasons about a consultation.

// ── S2 · HOW IT WORKS ────────────────────────────────────────
// Eight steps stacked vertically ran to most of a screen, which made a simple
// process look like a long one. Grouped into the three phases a doctor actually
// experiences — you talk, it thinks, it goes out — the whole flow fits in a
// single view, and the eight steps survive as the detail inside each phase.
const PHASES = [
  {
    n: '01',
    phase: 'You talk',
    lead: 'One tap at the start of the consultation.',
    tone: 'emerald' as const,
    steps: [
      { icon: Mic, t: 'Doctor records', d: 'No setup, no dictation voice.' },
      { icon: FileText, t: 'Live transcript', d: 'Speech becomes text as you speak, in its own script.' },
    ],
  },
  {
    n: '02',
    phase: 'It understands',
    lead: 'The visit is read as medicine, not as words.',
    tone: 'sky' as const,
    steps: [
      { icon: Brain, t: 'Medical AI understands', d: 'Symptoms, diagnoses, drugs and doses in context.' },
      { icon: ClipboardList, t: 'Clinical note generated', d: 'Structured the way a clinician writes.' },
      { icon: Pill, t: 'Prescription created', d: 'Strength, frequency and duration filled in.' },
      { icon: MessageSquare, t: 'Patient summary', d: 'A plain-language version they can follow.' },
    ],
  },
  {
    n: '03',
    phase: 'It goes out',
    lead: 'Filed and delivered before the patient stands up.',
    tone: 'violet' as const,
    steps: [
      { icon: Database, t: 'Saved to records', d: 'Against the same patient the clinic already has.' },
      { icon: Send, t: 'Shared on WhatsApp', d: 'Prescription PDF delivered, reminders scheduled.' },
    ],
  },
];

const TONE = {
  emerald: { chip: 'bg-emerald-50 text-emerald-700 border-emerald-100', icon: 'bg-emerald-50 text-emerald-600', num: 'text-emerald-500' },
  sky: { chip: 'bg-sky-50 text-sky-700 border-sky-100', icon: 'bg-sky-50 text-sky-600', num: 'text-sky-500' },
  violet: { chip: 'bg-violet-50 text-violet-700 border-violet-100', icon: 'bg-violet-50 text-violet-600', num: 'text-violet-500' },
};

export function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.85', 'end 0.6'] });
  const lineWidth = useSpring(useTransform(scrollYProgress, [0, 1], ['0%', '100%']), {
    stiffness: 60,
    damping: 22,
  });

  return (
    <section className="py-20 bg-white" id="how-it-works">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHead
          eyebrow="How it works"
          title="One recording."
          accent="Everything else is done."
          sub="From pressing record to the prescription landing on the patient's phone."
        />

        <div ref={ref} className="mt-12">
          {/* The rail now runs across the three phases instead of down eight steps,
              so the flow reads left-to-right in one glance on a desktop. */}
          <div className="hidden lg:block relative h-[2px] bg-slate-100 rounded-full mb-6">
            {!reduce && (
              <motion.div
                style={{ width: lineWidth }}
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-500 via-sky-500 to-violet-500"
              />
            )}
          </div>

          <div className="grid lg:grid-cols-3 gap-5 lg:gap-6">
            {PHASES.map((p, i) => {
              const tone = TONE[p.tone];
              return (
                <motion.div
                  key={p.phase}
                  initial={{ opacity: 0, y: reduce ? 0 : 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: 0.55, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] }}
                  className="relative rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:shadow-lg hover:border-slate-300 transition-all duration-300"
                >
                  <div className="flex items-baseline gap-2">
                    <span className={`text-xs font-bold tabular-nums ${tone.num}`}>{p.n}</span>
                    <h3 className="font-display text-lg font-extrabold text-slate-900">{p.phase}</h3>
                  </div>
                  <p className="text-[13px] text-slate-500 mt-1 leading-relaxed">{p.lead}</p>

                  <div className="mt-4 space-y-2.5">
                    {p.steps.map((s) => {
                      const Icon = s.icon;
                      return (
                        <div key={s.t} className="flex gap-2.5">
                          <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${tone.icon}`}>
                            <Icon className="w-3.5 h-3.5" />
                          </span>
                          <div className="min-w-0">
                            <div className="text-[13px] font-bold text-slate-800 leading-tight">{s.t}</div>
                            <p className="text-[12px] text-slate-500 leading-snug mt-0.5">{s.d}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── S4 · BEFORE vs AFTER ─────────────────────────────────────
const BEFORE = [
  { icon: Keyboard, t: 'Typing the note after every patient' },
  { icon: Search, t: 'Digging for the last visit and medicines' },
  { icon: FolderOpen, t: 'Re-entering the same details twice' },
  { icon: Clock, t: 'Notes finished late, from memory' },
];

const AFTER = [
  { icon: Mic, t: 'You just talk to the patient' },
  { icon: Brain, t: 'The note writes itself as you speak' },
  { icon: Pill, t: 'Prescription filled and safety-checked' },
  { icon: Send, t: 'Sent, filed and reminders set' },
];

export function BeforeAfter() {
  return (
    <section className="py-24 bg-slate-50 border-y border-slate-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHead
          eyebrow="The difference"
          title="Same consultation."
          accent="A fraction of the desk work."
        />

        <div className="grid md:grid-cols-2 gap-6 mt-14">
          {/* Without */}
          <Reveal>
            <div className="h-full rounded-3xl bg-white border border-slate-200 p-7">
              <div className="flex items-center justify-between mb-6">
                <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                  Without NovaScribe
                </span>
                <span className="text-sm font-bold text-slate-400 bg-slate-100 rounded-full px-3 py-1">
                  ~15 min per patient
                </span>
              </div>
              <ul className="space-y-3">
                {BEFORE.map((b) => {
                  const Icon = b.icon;
                  return (
                    <li key={b.t} className="flex items-start gap-3 text-slate-500">
                      <span className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-4 h-4" />
                      </span>
                      <span className="pt-1.5">{b.t}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </Reveal>

          {/* With */}
          <Reveal delay={0.12}>
            <div className="h-full rounded-3xl bg-white border-2 border-emerald-200 p-7 shadow-xl shadow-emerald-500/10 relative overflow-hidden">
              <div className="absolute -top-16 -right-10 w-56 h-56 rounded-full bg-emerald-100/60 blur-3xl" />
              <div className="relative">
                <div className="flex items-center justify-between mb-6">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-700">
                    With NovaScribe
                  </span>
                  <span className="text-sm font-bold text-white bg-emerald-600 rounded-full px-3 py-1">
                    ~30 seconds
                  </span>
                </div>
                <Stagger className="space-y-3">
                  {AFTER.map((a) => {
                    const Icon = a.icon;
                    return (
                      <motion.li
                        key={a.t}
                        variants={staggerItem}
                        className="flex items-start gap-3 text-slate-700 list-none"
                      >
                        <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                          <Icon className="w-4 h-4" />
                        </span>
                        <span className="pt-1.5 font-medium">{a.t}</span>
                        <Check className="w-4 h-4 text-emerald-500 ml-auto mt-2 flex-shrink-0" />
                      </motion.li>
                    );
                  })}
                </Stagger>
              </div>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.2}>
          <p className="text-center text-sm text-slate-400 mt-6">
            Timings are illustrative — they depend on your consultation length and how much you edit.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

// ── S5 · AI UNDERSTANDS MEDICINE ─────────────────────────────
const CHAIN = [
  { label: 'Symptoms', example: '“dizziness on standing”', tone: 'from-emerald-500 to-emerald-600' },
  { label: 'Medical context', example: 'recent Lisinopril increase', tone: 'from-sky-500 to-sky-600' },
  { label: 'Clinical reasoning', example: 'BP drop on posture change', tone: 'from-sky-500 to-violet-500' },
  { label: 'Assessment', example: 'orthostatic hypotension', tone: 'from-violet-500 to-violet-600' },
  { label: 'Plan & prescription', example: 'reduce dose · monitor BP', tone: 'from-violet-500 to-emerald-500' },
];

const FLOATING = [
  'Chief complaint', 'Allergy', 'Dosage', 'Duration', 'Vitals', 'Investigations',
  'Diagnosis', 'Follow-up', 'Advice', 'Drug interaction',
];

export function MedicalReasoning() {
  const reduce = useReducedMotion();

  return (
    <section className="py-24 bg-white relative overflow-hidden">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHead
          eyebrow="Clinical intelligence"
          title="It understands medicine,"
          accent="not just words."
          sub="General speech models hear sounds. NovaScribe follows the clinical thread of the conversation."
        />

        <div className="grid lg:grid-cols-2 gap-12 items-center mt-16">
          {/* The reasoning chain */}
          <div className="space-y-3">
            {CHAIN.map((c, i) => (
              <motion.div
                key={c.label}
                initial={{ opacity: 0, y: reduce ? 0 : 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.5 }}
                transition={{ duration: 0.5, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] }}
                className="relative"
              >
                <div className="flex items-center gap-4 rounded-2xl bg-white border border-slate-200 shadow-sm p-4">
                  <span
                    className={`w-10 h-10 rounded-xl bg-gradient-to-br ${c.tone} text-white flex items-center justify-center font-bold text-sm flex-shrink-0`}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="font-display font-extrabold text-slate-900">{c.label}</div>
                    <div className="text-sm text-slate-500 truncate">{c.example}</div>
                  </div>
                </div>
                {i < CHAIN.length - 1 && (
                  <div className="flex justify-center py-1">
                    <motion.span
                      animate={reduce ? undefined : { y: [0, 4, 0], opacity: [0.4, 1, 0.4] }}
                      transition={reduce ? undefined : { duration: 2, repeat: Infinity, delay: i * 0.2 }}
                      className="text-slate-300"
                    >
                      <ArrowRight className="w-4 h-4 rotate-90" />
                    </motion.span>
                  </div>
                )}
              </motion.div>
            ))}
          </div>

          {/* Floating vocabulary */}
          <Reveal delay={0.15}>
            <div className="relative h-[420px] rounded-3xl bg-gradient-to-br from-emerald-50 via-white to-violet-50 border border-slate-100 overflow-hidden">
              <div className="absolute inset-0 flex items-center justify-center">
                <motion.div
                  animate={reduce ? undefined : { scale: [1, 1.06, 1] }}
                  transition={reduce ? undefined : { duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                  className="w-28 h-28 rounded-full bg-white shadow-xl border border-slate-100 flex items-center justify-center"
                >
                  <Brain className="w-10 h-10 text-violet-600" />
                </motion.div>
              </div>

              {FLOATING.map((term, i) => {
                const angle = (i / FLOATING.length) * Math.PI * 2;
                const r = 38;
                const left = 50 + Math.cos(angle) * r;
                const top = 50 + Math.sin(angle) * (r * 0.85);
                return (
                  <motion.span
                    key={term}
                    initial={{ opacity: 0, scale: 0.85 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.15 + i * 0.07, type: 'spring', stiffness: 200, damping: 16 }}
                    style={{ left: `${left}%`, top: `${top}%` }}
                    className="absolute -translate-x-1/2 -translate-y-1/2"
                  >
                    <motion.span
                      animate={reduce ? undefined : { y: [0, -6, 0] }}
                      transition={reduce ? undefined : { duration: 4 + (i % 3), repeat: Infinity, ease: 'easeInOut', delay: i * 0.3 }}
                      className="block whitespace-nowrap text-[11px] font-semibold bg-white/90 backdrop-blur border border-slate-100 text-slate-600 rounded-full px-3 py-1.5 shadow-sm"
                    >
                      {term}
                    </motion.span>
                  </motion.span>
                );
              })}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
