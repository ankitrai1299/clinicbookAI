import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, Plus, Minus, ShieldCheck, ArrowRight } from 'lucide-react';
import { FadeIn } from './FadeIn';

// Trust + FAQ + final CTA — ClinicBook theme. The original used full-dark panels;
// here trust sits on slate-50 with sky/teal accents, and the closing CTA uses the
// platform's slate-900 band (the same dark note the ClinicBook hero mock uses).

const PILLARS = [
  { title: 'Encrypted end to end', desc: 'Consultation audio and notes are encrypted in transit and at rest.' },
  { title: 'Clinic-scoped by design', desc: 'Every record is bound to your clinic — no data ever crosses clinics.' },
  { title: 'Role-based access', desc: 'Doctors see only their own patients; admins see the clinic, and nothing more.' },
  { title: 'Never used for training', desc: 'Your patient data is never used to train foundational AI models.' },
  { title: 'Editable before saving', desc: 'The AI drafts; the doctor decides. Nothing is filed without review.' },
  { title: 'Interoperability ready', desc: 'Built to plug into existing EMRs rather than replace what your clinic runs.' },
];

const FAQS = [
  {
    q: 'How accurate is the medical transcription?',
    a: 'It is tuned for clinical speech — drug names, dosages, diagnoses and Indian accents — including Hindi, English and Hinglish mixed in the same sentence. A built-in medical glossary corrects commonly misheard drug names.',
  },
  {
    q: 'Which languages are supported?',
    a: 'Hindi, English and Hinglish today, plus Tamil, Telugu, Bengali, Marathi, Gujarati, Kannada, Malayalam and Punjabi — with auto-detect so the doctor never has to pick.',
  },
  {
    q: 'Can I edit the AI report?',
    a: 'Always. NovaScribe writes an accurate first draft; you review, edit and only then save, print or send it. Nothing is filed without you.',
  },
  {
    q: 'Can I upload an already-recorded consultation?',
    a: 'Yes. Upload an audio file and it is processed with the same clinical intelligence as a live recording.',
  },
  {
    q: 'Does it share patients with ClinicBook?',
    a: 'Yes — that is the point. NovaScribe and ClinicBook are two interfaces of one platform, so a patient booked on WhatsApp is the same patient you consult, with one shared timeline.',
  },
  {
    q: 'Can the prescription go to the patient on WhatsApp?',
    a: 'Yes. Once you finalize a prescription, it can be sent straight to the patient’s WhatsApp, and medicine reminders are scheduled automatically.',
  },
  {
    q: 'Can multiple doctors use one clinic?',
    a: 'Yes. Each doctor logs in with their own account and sees only their own patients and consultations, while the clinic admin sees everything with full attribution.',
  },
];

export function NovaTrust() {
  return (
    <section className="py-20 bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn className="text-center max-w-2xl mx-auto mb-12">
          <span className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white border border-slate-100 shadow-xs mb-6">
            <Lock className="w-6 h-6 text-sky-600" />
          </span>
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Private by{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-600 to-teal-600">design.</span>
          </h2>
          <p className="text-slate-600 mt-4 text-lg">Patient privacy isn’t a feature. It’s the foundation.</p>
        </FadeIn>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {PILLARS.map((p, i) => (
            <FadeIn key={p.title} delay={i * 0.07}>
              <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-xs h-full">
                <ShieldCheck className="w-5 h-5 text-teal-600 mb-3" />
                <h4 className="font-display font-bold text-slate-900 mb-1.5">{p.title}</h4>
                <p className="text-sm text-slate-600 leading-relaxed">{p.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

export function NovaFAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="py-20 bg-white border-y border-slate-100">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn className="mb-10 text-center">
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Common{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-600 to-teal-600">questions.</span>
          </h2>
        </FadeIn>

        <div className="divide-y divide-slate-100 border-t border-slate-100">
          {FAQS.map((f, i) => (
            <div key={f.q} className="py-5">
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-start justify-between gap-6 text-left group cursor-pointer"
                aria-expanded={open === i}
              >
                <span
                  className={`font-display font-bold text-lg transition-colors ${
                    open === i ? 'text-slate-900' : 'text-slate-600 group-hover:text-slate-900'
                  }`}
                >
                  {f.q}
                </span>
                <span className="shrink-0 w-8 h-8 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center">
                  {open === i ? <Minus className="w-4 h-4 text-sky-600" /> : <Plus className="w-4 h-4 text-slate-400" />}
                </span>
              </button>
              <AnimatePresence>
                {open === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.35, ease: [0.04, 0.62, 0.23, 0.98] }}
                    className="overflow-hidden"
                  >
                    <p className="pt-4 text-slate-600 leading-relaxed">{f.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function NovaFinalCTA({ isLoggedIn, onOpen }: { isLoggedIn: boolean; onOpen: () => void }) {
  return (
    <section className="py-20 bg-slate-900 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-sky-500/10 blur-3xl rounded-full pointer-events-none" />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
        <FadeIn>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight leading-tight">
            Spend less time documenting.
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-teal-300">
              Spend more time treating patients.
            </span>
          </h2>
          <p className="text-slate-300 mt-5 text-lg max-w-xl mx-auto leading-relaxed">
            Join clinics using NovaScribe to remove the documentation burden — and give every visit back to the
            patient.
          </p>
          <button
            onClick={onOpen}
            className="mt-8 px-8 py-4 bg-white text-slate-900 rounded-xl font-bold hover:bg-slate-100 shadow-lg transition-all inline-flex items-center gap-2 group cursor-pointer"
          >
            {isLoggedIn ? 'Open NovaScribe' : 'Sign in to start'}
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </FadeIn>
      </div>
    </section>
  );
}
