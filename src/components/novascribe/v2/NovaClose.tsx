import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Quote, Plus, Minus, ArrowRight, PlayCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { AmbientBackdrop, Reveal, SectionHead } from './primitives';

// Sections 11–13: what doctors say, what they ask, and the close.

// ── S11 · TESTIMONIALS ───────────────────────────────────────
// PLACEHOLDER CONTENT. These are illustrative of the outcomes the product is
// built for — they are NOT real quotes, and are labelled as such on the page.
// Replace `TESTIMONIALS` with consented, attributable quotes before any launch;
// inventing named doctors and hospitals would be a fabricated endorsement.
const TESTIMONIALS = [
  {
    quote:
      'The note is ready before the patient leaves the room. That hour I used to spend after clinic is simply gone.',
    role: 'General Physician',
    setting: 'Single-doctor clinic, 40 patients/day',
  },
  {
    quote:
      'It handles the way we actually speak — half Hindi, half English — without me changing anything about my consultation.',
    role: 'Paediatrician',
    setting: 'Multi-speciality clinic',
  },
  {
    quote:
      'Patients stop calling for their prescription because it is already on their WhatsApp when they reach home.',
    role: 'Dermatologist',
    setting: 'Two-location practice',
  },
];

export function Testimonials() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (paused || reduce) return;
    const id = setTimeout(() => setI((n) => (n + 1) % TESTIMONIALS.length), 6000);
    return () => clearTimeout(id);
  }, [i, paused, reduce]);

  const t = TESTIMONIALS[i];

  return (
    <section className="py-24 bg-slate-50 border-y border-slate-100">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHead eyebrow="From the OPD" title="What changes" accent="on a clinic day." />

        <div
          className="mt-12"
          onPointerEnter={() => setPaused(true)}
          onPointerLeave={() => setPaused(false)}
        >
          <div className="relative rounded-3xl bg-white/70 backdrop-blur-xl border border-white shadow-xl p-8 sm:p-10 min-h-[220px] flex flex-col justify-center">
            <Quote className="w-8 h-8 text-emerald-500/40 mb-4" />
            <AnimatePresence mode="wait">
              <motion.blockquote
                key={i}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              >
                <p className="font-display text-xl sm:text-2xl text-slate-800 leading-relaxed">“{t.quote}”</p>
                <footer className="mt-5 text-sm">
                  <span className="font-bold text-slate-900">{t.role}</span>
                  <span className="text-slate-400"> · {t.setting}</span>
                </footer>
              </motion.blockquote>
            </AnimatePresence>
          </div>

          <div className="flex items-center justify-center gap-3 mt-6">
            <button
              onClick={() => setI((n) => (n - 1 + TESTIMONIALS.length) % TESTIMONIALS.length)}
              aria-label="Previous"
              className="w-9 h-9 rounded-full bg-white border border-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {TESTIMONIALS.map((_, n) => (
              <button
                key={n}
                onClick={() => setI(n)}
                aria-label={`Testimonial ${n + 1}`}
                className={`h-2 rounded-full transition-all duration-300 ${
                  n === i ? 'w-6 bg-slate-900' : 'w-2 bg-slate-300 hover:bg-slate-400'
                }`}
              />
            ))}
            <button
              onClick={() => setI((n) => (n + 1) % TESTIMONIALS.length)}
              aria-label="Next"
              className="w-9 h-9 rounded-full bg-white border border-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <p className="text-center text-[11px] text-slate-400 mt-5">
            Illustrative of intended outcomes — real, attributed quotes will replace these before launch.
          </p>
        </div>
      </div>
    </section>
  );
}

// ── S12 · FAQ ────────────────────────────────────────────────
const FAQS = [
  {
    q: 'How accurate is it with Indian accents and mixed languages?',
    a: 'It is tuned for clinical speech in Hindi, English and Hinglish — including sentences that switch mid-way. A medical glossary corrects drug names that speech models commonly mishear. You always review the note before it is saved.',
  },
  {
    q: 'Does the AI decide the diagnosis or prescription?',
    a: 'No. It drafts from what was actually said in the consultation. Nothing is filed, printed or sent until you review and sign it — and every field stays editable.',
  },
  {
    q: 'What happens if the recording is interrupted?',
    a: 'Audio is written to storage as it is captured, so a phone call, a crash or a lost network does not lose the consultation. When you reopen it, the recording is offered back for transcription.',
  },
  {
    q: 'Where does patient data live?',
    a: 'In your clinic\'s own scoped records. Every row is bound to your clinic, one clinic can never read another\'s, and each doctor sees only their own patients.',
  },
  {
    q: 'Can I use it alongside my existing EMR?',
    a: 'Yes. NovaScribe reads and writes through an adapter layer, with OpenEMR and HL7 FHIR supported today, so it sits on top of what you already run rather than replacing it.',
  },
  {
    q: 'Does the patient get the prescription automatically?',
    a: 'When you finalize it, the PDF goes to the patient on WhatsApp and medicine reminders are scheduled from the doses you wrote. They can also ask for it again later and it is re-sent.',
  },
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="py-24 bg-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHead eyebrow="Questions" title="Everything doctors" accent="ask us first." />

        <div className="mt-12 space-y-3">
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            return (
              <Reveal key={f.q} delay={i * 0.04}>
                <div
                  className={`rounded-2xl border backdrop-blur-xl transition-colors duration-300 ${
                    isOpen ? 'bg-white/80 border-emerald-200 shadow-lg' : 'bg-white/60 border-slate-200'
                  }`}
                >
                  <button
                    onClick={() => setOpen(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    className="w-full flex items-start justify-between gap-5 text-left p-5 cursor-pointer"
                  >
                    <span className="font-display font-bold text-slate-900">{f.q}</span>
                    <span
                      className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                        isOpen ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {isOpen ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    </span>
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.35, ease: [0.04, 0.62, 0.23, 0.98] }}
                        className="overflow-hidden"
                      >
                        <p className="px-5 pb-5 text-slate-600 leading-relaxed">{f.a}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── S13 · FINAL CTA ──────────────────────────────────────────
export function FinalCTA({ isLoggedIn, onOpen }: { isLoggedIn: boolean; onOpen: () => void }) {
  return (
    <section className="relative py-24 overflow-hidden bg-slate-900">
      <AmbientBackdrop className="opacity-40" />
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/40 via-slate-900 to-violet-900/40" />

      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <Reveal>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight leading-[1.1]">
            Ready to get your evenings back?
          </h2>
          <p className="text-lg text-slate-300 mt-5 max-w-xl mx-auto leading-relaxed">
            Record your next consultation and see the note write itself. Nothing to install for your patients,
            nothing to learn for you.
          </p>
        </Reveal>

        <Reveal delay={0.12}>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-9">
            <button
              onClick={onOpen}
              className="px-8 py-4 rounded-2xl bg-white text-slate-900 font-bold shadow-2xl hover:bg-slate-100 transition-all active:scale-[0.98] flex items-center justify-center gap-2 group cursor-pointer"
            >
              {isLoggedIn ? 'Open NovaScribe' : 'Start free trial'}
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
            <a
              href="#live-demo"
              className="px-8 py-4 rounded-2xl bg-white/10 backdrop-blur border border-white/20 text-white font-bold hover:bg-white/20 transition-all flex items-center justify-center gap-2"
            >
              <PlayCircle className="w-4.5 h-4.5" /> Watch the demo
            </a>
          </div>
        </Reveal>

        <Reveal delay={0.2}>
          <p className="text-sm text-slate-400 mt-7">
            Works on web and Android · Hindi, English &amp; Hinglish · Your data stays in your clinic
          </p>
        </Reveal>
      </div>
    </section>
  );
}
