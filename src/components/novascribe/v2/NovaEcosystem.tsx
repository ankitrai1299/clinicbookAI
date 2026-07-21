import { motion, useReducedMotion } from 'motion/react';
import {
  Stethoscope, HeartPulse, Sparkles, Ear, Bone, Baby, Flower2, Smile, Brain,
  MessageSquare, Mic, FileText, Pill, Send, CalendarClock, Repeat, Languages, ShieldCheck, Clock,
} from 'lucide-react';
import { Counter, Reveal, SectionHead, Stagger, staggerItem, TiltCard } from './primitives';

// Sections 7–10: who it's for, what it measurably changes, the full loop with
// ClinicBook, and what it connects to.

// ── S7 · SPECIALTIES ─────────────────────────────────────────
const SPECIALTIES = [
  { icon: Stethoscope, label: 'General Physician' },
  { icon: HeartPulse, label: 'Cardiology' },
  { icon: Sparkles, label: 'Dermatology' },
  { icon: Ear, label: 'ENT' },
  { icon: Bone, label: 'Orthopaedics' },
  { icon: Baby, label: 'Paediatrics' },
  { icon: Flower2, label: 'Gynaecology' },
  { icon: Smile, label: 'Dental' },
  { icon: Brain, label: 'Psychiatry' },
];

export function Specialties() {
  return (
    <section className="py-24 bg-slate-50 border-y border-slate-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHead
          eyebrow="Built for every OPD"
          title="One scribe,"
          accent="every specialty."
          sub="The vocabulary changes with the clinic — the workflow doesn't."
        />

        <Stagger className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-4 mt-14" gap={0.06}>
          {SPECIALTIES.map((s) => {
            const Icon = s.icon;
            return (
              <motion.div key={s.label} variants={staggerItem}>
                <TiltCard className="h-full bg-white border border-slate-200 p-5 group" glow="rgba(56,189,248,0.2)">
                  <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-50 to-sky-50 border border-slate-100 flex items-center justify-center text-sky-600 mb-4 transition-transform duration-300 group-hover:scale-110">
                    <Icon className="w-5 h-5" />
                  </span>
                  <div className="font-display font-extrabold text-slate-900">{s.label}</div>
                </TiltCard>
              </motion.div>
            );
          })}
        </Stagger>
      </div>
    </section>
  );
}

// ── S8 · WHAT CHANGES ────────────────────────────────────────
// Deliberately capability facts, not invented efficacy percentages: a medical
// product should not advertise accuracy figures it has not measured.
const STATS = [
  { value: 10, suffix: '', label: 'Indian languages', sub: 'incl. Hindi, English & Hinglish' },
  { value: 18, suffix: '', label: 'Structured sections', sub: 'in every clinical report' },
  { value: 3, suffix: '', label: 'Safety checks', sub: 'allergy · interaction · duplicate' },
  { value: 0, suffix: '', label: 'Words typed', sub: 'the note writes itself' },
];

const TRAITS = [
  { icon: Clock, title: 'Notes done with the patient', desc: 'Not after clinic, not from memory.' },
  { icon: Languages, title: 'Speaks how your patients speak', desc: 'Mixed Hindi-English in one sentence is normal here.' },
  { icon: ShieldCheck, title: 'You sign, not the AI', desc: 'Every note is editable and nothing is filed without you.' },
];

export function WhatChanges() {
  return (
    <section className="py-24 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHead eyebrow="Why doctors keep it" title="Less desk work," accent="more medicine." />

        <Stagger className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-14">
          {STATS.map((s) => (
            <motion.div key={s.label} variants={staggerItem}>
              <TiltCard className="h-full bg-gradient-to-br from-white to-slate-50 border border-slate-200 p-6 text-center">
                <div className="font-display text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-br from-emerald-600 via-sky-600 to-violet-600">
                  <Counter to={s.value} suffix={s.suffix} />
                </div>
                <div className="font-display font-extrabold text-slate-900 mt-2">{s.label}</div>
                <div className="text-xs text-slate-500 mt-1">{s.sub}</div>
              </TiltCard>
            </motion.div>
          ))}
        </Stagger>

        <Stagger className="grid md:grid-cols-3 gap-4 mt-6" delay={0.15}>
          {TRAITS.map((t) => {
            const Icon = t.icon;
            return (
              <motion.div key={t.title} variants={staggerItem}>
                <div className="h-full rounded-2xl bg-white border border-slate-200 p-5 flex gap-3">
                  <span className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5" />
                  </span>
                  <div>
                    <div className="font-display font-extrabold text-slate-900">{t.title}</div>
                    <div className="text-sm text-slate-500 mt-0.5">{t.desc}</div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </Stagger>
      </div>
    </section>
  );
}

// ── S9 · THE FULL LOOP ───────────────────────────────────────
const JOURNEY = [
  { icon: MessageSquare, title: 'Patient books', side: 'ClinicBook', tone: 'emerald' },
  { icon: CalendarClock, title: 'Appears in your queue', side: 'NovaScribe', tone: 'sky' },
  { icon: Mic, title: 'Consultation recorded', side: 'NovaScribe', tone: 'sky' },
  { icon: FileText, title: 'Note written', side: 'NovaScribe', tone: 'sky' },
  { icon: Pill, title: 'Prescription created', side: 'NovaScribe', tone: 'violet' },
  { icon: Send, title: 'Sent on WhatsApp', side: 'ClinicBook', tone: 'emerald' },
  { icon: Repeat, title: 'Follow-up books itself', side: 'ClinicBook', tone: 'emerald' },
];

const TONE_MAP: Record<string, string> = {
  emerald: 'from-emerald-500 to-emerald-600',
  sky: 'from-sky-500 to-sky-600',
  violet: 'from-violet-500 to-violet-600',
};

export function PatientJourney() {
  const reduce = useReducedMotion();

  return (
    <section className="py-24 bg-slate-50 border-y border-slate-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHead
          eyebrow="The whole loop"
          title="Booking to follow-up,"
          accent="one continuous thread."
          sub="NovaScribe writes the visit. ClinicBook carries it to the patient — and brings them back."
        />

        <div className="mt-14 overflow-x-auto pb-4">
          <div className="flex items-stretch gap-3 min-w-[900px]">
            {JOURNEY.map((j, i) => {
              const Icon = j.icon;
              return (
                <motion.div
                  key={j.title}
                  initial={{ opacity: 0, y: reduce ? 0 : 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{ duration: 0.5, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                  className="flex-1 relative"
                >
                  <div className="h-full rounded-2xl bg-white border border-slate-200 p-4 shadow-sm hover:shadow-lg transition-shadow duration-300">
                    <span
                      className={`w-10 h-10 rounded-xl bg-gradient-to-br ${TONE_MAP[j.tone]} text-white flex items-center justify-center mb-3`}
                    >
                      <Icon className="w-4.5 h-4.5" />
                    </span>
                    <div className="font-display font-extrabold text-slate-900 text-sm leading-snug">{j.title}</div>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mt-1.5">
                      {j.side}
                    </div>
                  </div>
                  {i === JOURNEY.length - 1 && (
                    <motion.span
                      animate={reduce ? undefined : { opacity: [0.3, 1, 0.3] }}
                      transition={reduce ? undefined : { duration: 2.5, repeat: Infinity }}
                      className="absolute -right-1 top-1/2 -translate-y-1/2 text-emerald-500 text-lg"
                    >
                      ↻
                    </motion.span>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── S10 · CONNECTS TO ────────────────────────────────────────
// Split honestly: what is actually wired today vs what is on the roadmap.
const LIVE = ['WhatsApp Cloud API', 'OpenEMR', 'HL7 FHIR', 'ClinicBook AI'];
const PLANNED = ['ABDM', 'Google Calendar', 'Razorpay', 'Stripe'];

export function Integrations() {
  return (
    <section className="py-24 bg-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHead
          eyebrow="Fits your stack"
          title="Works with what"
          accent="your clinic already runs."
          sub="NovaScribe sits on top of your systems through a ports-and-adapters layer — it doesn't ask you to replace them."
        />

        <Reveal delay={0.1}>
          <p className="text-center text-[11px] font-bold uppercase tracking-widest text-emerald-700 mt-14 mb-4">
            Available today
          </p>
        </Reveal>
        <Stagger className="flex flex-wrap justify-center gap-3" gap={0.07}>
          {LIVE.map((n) => (
            <motion.div key={n} variants={staggerItem}>
              <div className="rounded-xl bg-white border border-slate-200 shadow-sm px-5 py-3 font-display font-bold text-slate-800 hover:border-emerald-300 hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                {n}
              </div>
            </motion.div>
          ))}
        </Stagger>

        <Reveal delay={0.1}>
          <p className="text-center text-[11px] font-bold uppercase tracking-widest text-slate-400 mt-10 mb-4">
            On the roadmap
          </p>
        </Reveal>
        <Stagger className="flex flex-wrap justify-center gap-3" gap={0.07}>
          {PLANNED.map((n) => (
            <motion.div key={n} variants={staggerItem}>
              <div className="rounded-xl bg-slate-50 border border-dashed border-slate-300 px-5 py-3 font-display font-bold text-slate-400">
                {n}
              </div>
            </motion.div>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
