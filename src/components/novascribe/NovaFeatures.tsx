import { Mic, Edit3, Brain, FileText, CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';
import { FadeIn } from './FadeIn';

// NovaScribe landing — the product sections, in the ClinicBook theme:
// how it works → clinical intelligence → report quality → why doctors choose it.
// Sections alternate white / slate-50 exactly like the ClinicBook landing.

const STEPS = [
  { icon: Mic, title: 'Record consultation', desc: 'The doctor just speaks naturally — no template, no typing.' },
  { icon: Edit3, title: 'Live transcription', desc: 'Speech becomes an accurate medical transcript, in Hindi, English or Hinglish.' },
  { icon: Brain, title: 'Clinical intelligence', desc: 'AI understands symptoms, medicines, diagnoses, allergies, investigations and follow-ups.' },
  { icon: FileText, title: 'Structured report', desc: 'A clean, structured clinical report and prescription — instantly.' },
];

const TAGS = [
  { label: 'Symptoms', pos: 'top-2 left-8' },
  { label: 'Diagnosis', pos: 'top-14 right-6' },
  { label: 'Medicines', pos: 'top-1/3 left-0' },
  { label: 'Dosage', pos: 'bottom-1/3 left-10' },
  { label: 'Vitals', pos: 'top-1/2 right-8' },
  { label: 'Investigations', pos: 'bottom-1/4 right-0' },
  { label: 'Allergies', pos: 'bottom-8 left-1/4' },
  { label: 'Follow-up', pos: 'bottom-2 right-1/4' },
  { label: 'Prescription', pos: 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2', highlight: true },
];

const REPORT = [
  { title: 'Chief complaint', val: 'Frequent morning dizziness.' },
  { title: 'History of present illness', val: 'Dizziness on waking, lasting ~30 minutes. Correlates with the recent Lisinopril dose increase.' },
  { title: 'Clinical findings', val: 'BP 118/76 mmHg · HR 72 bpm · normal sinus rhythm.' },
  { title: 'Assessment', val: 'Orthostatic hypotension, likely secondary to the Lisinopril adjustment.' },
  { title: 'Treatment plan', val: 'Reduce Lisinopril to 5 mg daily. Monitor BP morning and evening.' },
];

const OUTCOMES = [
  'Cut documentation time dramatically',
  'Never miss an important clinical detail',
  'Structured, consistent clinical notes',
  'Every report stays fully editable',
  'Hindi, English & Hinglish support',
  'Patient timeline built in',
  'Previous-visit comparison',
  'Same patients as ClinicBook',
];

export function NovaFeatures() {
  return (
    <>
      {/* HOW IT WORKS */}
      <section className="py-20 bg-white border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeIn className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              From conversation to{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-600 to-teal-600">
                clinical documentation.
              </span>
            </h2>
            <p className="text-slate-600 mt-4 text-lg">One recording. Everything documented automatically.</p>
          </FadeIn>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <FadeIn key={s.title} delay={i * 0.1}>
                  <div className="bg-sky-50/50 rounded-2xl p-6 border border-sky-100/60 shadow-xs h-full hover:shadow-md transition-shadow relative overflow-hidden group">
                    <div className="absolute top-4 right-4 w-9 h-9 bg-white text-slate-400 font-mono font-bold text-sm rounded-full flex items-center justify-center border border-slate-100">
                      {i + 1}
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-white shadow-xs border border-slate-100 flex items-center justify-center mb-5 text-sky-600">
                      <Icon className="w-6 h-6" />
                    </div>
                    <h3 className="font-display font-extrabold text-slate-900 text-lg leading-snug">{s.title}</h3>
                    <p className="text-slate-600 text-sm leading-relaxed mt-2">{s.desc}</p>
                  </div>
                </FadeIn>
              );
            })}
          </div>
        </div>
      </section>

      {/* CLINICAL INTELLIGENCE */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-12 items-center">
          <FadeIn>
            <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">
              AI that understands medicine,
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-600 to-teal-600">
                not just words.
              </span>
            </h2>
            <p className="text-slate-600 mt-4 text-lg leading-relaxed max-w-md">
              Built specifically for healthcare conversations — not generic speech recognition. It picks out what
              actually matters in a visit.
            </p>
          </FadeIn>

          <div className="relative h-[340px]">
            <div className="absolute inset-0 bg-sky-100 blur-3xl opacity-30 rounded-full" />
            <div className="relative w-full h-full">
              {TAGS.map((t, i) => (
                <motion.div
                  key={t.label}
                  initial={{ opacity: 0, scale: 0.85, y: 16 }}
                  whileInView={{ opacity: 1, scale: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08, type: 'spring' }}
                  className={`absolute ${t.pos} px-4 py-2 rounded-full text-sm font-semibold shadow-xs border transition-transform hover:scale-105 ${
                    t.highlight
                      ? 'bg-sky-600 text-white border-sky-600 shadow-lg shadow-sky-100'
                      : 'bg-white text-slate-600 border-slate-200 hover:text-slate-900'
                  }`}
                >
                  {t.label}
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* REPORT QUALITY */}
      <section className="py-20 bg-white border-y border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-12 items-center">
          <FadeIn className="order-2 lg:order-1">
            <div className="bg-slate-50 rounded-2xl p-6 sm:p-8 border border-slate-100 shadow-sm space-y-4">
              {REPORT.map((r) => (
                <div
                  key={r.title}
                  className="bg-white p-4 rounded-xl border border-slate-100 shadow-xs hover:-translate-y-0.5 transition-transform"
                >
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-sky-600 mb-1.5">{r.title}</h4>
                  <p className="text-sm text-slate-700 leading-relaxed">{r.val}</p>
                </div>
              ))}
            </div>
          </FadeIn>

          <FadeIn className="order-1 lg:order-2">
            <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">
              Reports that read like they were
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-600 to-teal-600">
                written by a clinician.
              </span>
            </h2>
            <p className="text-slate-600 mt-4 text-lg leading-relaxed max-w-md">
              Every report follows structured clinical documentation — and stays fully editable before you save,
              print or send it on WhatsApp.
            </p>
          </FadeIn>
        </div>
      </section>

      {/* WHY NOVASCRIBE */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeIn className="text-center mb-10">
            <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Why doctors choose NovaScribe.
            </h2>
          </FadeIn>

          <div className="grid sm:grid-cols-2 gap-4">
            {OUTCOMES.map((o, i) => (
              <FadeIn key={o} delay={i * 0.05}>
                <div className="flex items-center gap-3 bg-white p-4 rounded-2xl border border-slate-100 shadow-xs">
                  <span className="w-8 h-8 rounded-full bg-teal-50 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-5 h-5 text-teal-600" />
                  </span>
                  <span className="text-[15px] font-semibold text-slate-800">{o}</span>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

export default NovaFeatures;
