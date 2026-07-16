import { FadeIn } from './ui/FadeIn';
import { motion, useScroll, useTransform } from 'motion/react';
import { useRef } from 'react';
import { FileText, Mic, Brain, Edit3, Check, CheckCircle2 } from 'lucide-react';

export function Features() {
  const sectionRef1 = useRef<HTMLDivElement>(null);
  const sectionRef2 = useRef<HTMLDivElement>(null);
  const sectionRef3 = useRef<HTMLDivElement>(null);

  const { scrollYProgress: scrollY1 } = useScroll({ target: sectionRef1, offset: ["start end", "end start"] });
  const { scrollYProgress: scrollY2 } = useScroll({ target: sectionRef2, offset: ["start end", "end start"] });
  const { scrollYProgress: scrollY3 } = useScroll({ target: sectionRef3, offset: ["start end", "end start"] });

  const y1 = useTransform(scrollY1, [0, 1], [80, -80]);
  const y2 = useTransform(scrollY2, [0, 1], [80, -80]);
  const y3 = useTransform(scrollY3, [0, 1], [80, -80]);

  return (
    <div className="bg-white relative pb-16 md:pb-24">
      {/* SECTION 2 - HOW IT WORKS */}
      <section ref={sectionRef1} className="py-16 md:py-24 relative overflow-hidden border-b border-slate-100">
        <div className="max-w-[1200px] mx-auto px-6">
          <FadeIn className="text-center max-w-3xl mx-auto mb-12">
            <h2 className="text-4xl md:text-5xl lg:text-7xl font-medium tracking-tight text-[#0B0F1F] mb-6 leading-[1.05]">
              From conversation<br />
              <span className="font-serif italic font-light text-slate-400">to clinical documentation.</span>
            </h2>
            <p className="text-xl text-slate-500 leading-relaxed font-light">
              One recording. Everything documented automatically.
            </p>
          </FadeIn>

          <div className="grid md:grid-cols-4 gap-6">
            {[
              { icon: Mic, title: "Record Consultation", desc: "Doctor starts speaking naturally." },
              { icon: Edit3, title: "Live Transcription", desc: "Speech converts into accurate medical transcript." },
              { icon: Brain, title: "Clinical Intelligence", desc: "AI understands symptoms, medicines, diagnoses, allergies, investigations and follow-ups." },
              { icon: FileText, title: "Structured Report", desc: "Generate premium SOAP notes and clinical documentation instantly." }
            ].map((step, i) => (
              <FadeIn key={`step-${i}`} delay={i * 0.1}>
                <div className="bg-[#FAFBFD] rounded-[32px] p-8 h-full border border-slate-100 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-[#4F6BFF]/5 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110" />
                  <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center mb-6 relative z-10 border border-slate-100 text-[#4F6BFF]">
                    <step.icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-[#0B0F1F] mb-3 relative z-10">{step.title}</h3>
                  <p className="text-slate-500 font-medium text-sm leading-relaxed relative z-10">{step.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 3 - CLINICAL INTELLIGENCE */}
      <section ref={sectionRef2} className="py-16 md:py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-[#FAFBFD] -skew-y-2 origin-top-left -z-10" />
        <div className="max-w-[1200px] mx-auto px-6 grid md:grid-cols-2 gap-12 md:gap-16 items-center">
          <div className="relative z-10">
            <FadeIn>
              <h2 className="text-4xl md:text-5xl lg:text-7xl font-medium tracking-tight text-[#0B0F1F] mb-6 leading-[1.05]">
                AI that understands medicine,<br />
                <span className="font-serif italic font-light text-slate-400">not just words.</span>
              </h2>
              <p className="text-xl text-slate-500 leading-relaxed font-light max-w-md">
                Built specifically for healthcare conversations—not generic speech recognition.
              </p>
            </FadeIn>
          </div>

          <motion.div style={{ y: y2 }} className="relative h-[400px]">
            <div className="absolute inset-0 bg-[#4F6BFF]/10 blur-[120px] rounded-full mix-blend-multiply" />
            <div className="relative w-full h-full flex items-center justify-center">
              {[
                { label: 'Symptoms', pos: '-top-4 left-10', delay: 0 },
                { label: 'Diagnosis', pos: 'top-12 right-4', delay: 0.1 },
                { label: 'Medicines', pos: 'top-1/4 left-0', delay: 0.2 },
                { label: 'Dosage', pos: 'bottom-1/3 left-12', delay: 0.3 },
                { label: 'Vitals', pos: 'top-1/3 right-10', delay: 0.4 },
                { label: 'Investigations', pos: 'bottom-1/4 right-0', delay: 0.5 },
                { label: 'Allergies', pos: 'bottom-10 left-1/4', delay: 0.6 },
                { label: 'Follow-up', pos: 'bottom-4 right-1/4', delay: 0.7 },
                { label: 'Timeline', pos: 'top-2 left-1/3', delay: 0.8 },
                { label: 'Prescription', pos: 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2', delay: 0.9, highlight: true }
              ].map((tag, i) => (
                <motion.div
                  key={`tag-${i}`}
                  initial={{ opacity: 0, scale: 0.8, y: 20 }}
                  whileInView={{ opacity: 1, scale: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: tag.delay, type: 'spring' }}
                  className={`absolute ${tag.pos} px-5 py-2.5 rounded-full shadow-sm border font-bold text-sm tracking-wide transition-transform hover:scale-105 ${
                    tag.highlight 
                      ? 'bg-[#0B0F1F] text-white border-[#0B0F1F] shadow-[0_8px_30px_rgba(11,15,31,0.2)]' 
                      : 'bg-white text-slate-600 border-slate-100 hover:border-slate-200 hover:text-[#0B0F1F]'
                  }`}
                >
                  {tag.label}
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* SECTION 4 - REPORT QUALITY */}
      <section ref={sectionRef3} className="py-16 md:py-24 relative overflow-hidden border-b border-slate-100">
        <div className="max-w-[1200px] mx-auto px-6 grid md:grid-cols-2 gap-12 md:gap-16 items-center">
          <motion.div style={{ y: y3 }} className="relative order-2 md:order-1">
            <div className="absolute inset-0 bg-[#4F6BFF]/5 blur-[140px] rounded-full mix-blend-multiply" />
            <div className="bg-white/40 backdrop-blur-2xl rounded-[32px] md:rounded-[40px] p-8 md:p-12 shadow-2xl shadow-[#0B0F1F]/5 border border-slate-100 relative overflow-hidden">
              <div className="space-y-6">
                {[
                  { title: "Chief Complaint", val: "Frequent morning dizziness." },
                  { title: "History of Present Illness", val: "Patient reports experiencing dizziness upon waking, lasting for 30 minutes. Correlated with recent Lisinopril dosage increase." },
                  { title: "Clinical Findings", val: "BP: 118/76 mmHg. Heart rate: 72 bpm. Normal sinus rhythm." },
                  { title: "Assessment", val: "Orthostatic hypotension likely secondary to Lisinopril adjustment." },
                  { title: "Treatment Plan", val: "Reduce Lisinopril to 5mg daily. Monitor blood pressure morning and evening." },
                ].map((item, i) => (
                  <div key={`report-${i}`} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 transition-transform hover:-translate-y-1">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#4F6BFF] mb-2">{item.title}</h4>
                    <p className="text-sm font-medium text-[#111827]">{item.val}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          <div className="relative z-10 order-1 md:order-2">
            <FadeIn>
              <h2 className="text-4xl md:text-5xl lg:text-7xl font-medium tracking-tight text-[#0B0F1F] mb-6 leading-[1.05]">
                Reports that feel written<br />
                <span className="font-serif italic font-light text-slate-400">by a clinician.</span>
              </h2>
              <p className="text-xl text-slate-500 leading-relaxed font-light mb-8 max-w-md">
                Every report follows structured clinical documentation and remains fully editable before saving.
              </p>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* SECTION 5 - WHY NOVASCRIBE */}
      <section className="py-16 md:py-24 relative bg-[#FAFBFD]">
        <div className="max-w-[1000px] mx-auto px-6">
          <FadeIn className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl lg:text-7xl font-medium tracking-tight text-[#0B0F1F] leading-[1.05]">
              Why doctors choose NovaScribe.
            </h2>
          </FadeIn>
          
          <div className="grid md:grid-cols-2 gap-x-12 gap-y-6 max-w-3xl mx-auto">
            {[
              "Reduce documentation time by up to 70%",
              "Never miss important clinical details",
              "Structured SOAP documentation",
              "Fully editable reports",
              "Multi-language support",
              "Patient timeline",
              "Previous visit comparison"
            ].map((outcome, i) => (
              <FadeIn key={`outcome-${i}`} delay={i * 0.05}>
                <div className="flex items-center gap-4 bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                  <div className="w-8 h-8 rounded-full bg-[#4F6BFF]/10 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-5 h-5 text-[#4F6BFF]" />
                  </div>
                  <span className="text-[15px] font-bold text-[#111827] tracking-wide">{outcome}</span>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
