import { FadeIn } from './ui/FadeIn';
import { Plus, Minus, Lock } from 'lucide-react';
import { useState, useRef } from 'react';
import { motion, AnimatePresence, useScroll, useTransform } from 'motion/react';

export function Trust() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start']
  });

  const y = useTransform(scrollYProgress, [0, 1], [0, 100]);

  return (
    <section ref={containerRef} className="py-16 md:py-24 bg-[#0B0F1F] relative overflow-hidden rounded-t-[40px] md:rounded-t-[80px]">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22 opacity=%220.05%22/%3E%3C/svg%3E')] mix-blend-overlay pointer-events-none" />
      
      <motion.div style={{ y }} className="absolute top-0 right-0 w-[800px] h-[800px] bg-[#4F6BFF]/10 blur-[150px] rounded-full pointer-events-none -translate-y-1/4 translate-x-1/4 mix-blend-screen" />

      <div className="max-w-[1000px] mx-auto px-6 relative z-10 text-center">
        <FadeIn>
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-white/5 border border-white/10 mb-12 shadow-2xl backdrop-blur-xl">
             <Lock className="w-8 h-8 text-[#4F6BFF]" />
          </div>
          <h2 className="text-5xl md:text-7xl font-medium tracking-tight text-white mb-8 leading-[1.05]">
            Private by <span className="font-serif italic font-light text-slate-400">design.</span>
          </h2>
          <p className="text-xl md:text-2xl text-slate-400 leading-relaxed font-light mb-12 max-w-2xl mx-auto">
            Patient privacy isn't a feature. It's our foundation.
          </p>
        </FadeIn>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-12 border-t border-white/5 pt-12 max-w-4xl mx-auto text-left">
          <FadeIn delay={0.1}>
             <h4 className="font-serif italic text-xl text-slate-200 mb-2">AES-256 Encryption</h4>
             <p className="text-slate-500 font-light text-sm">Military-grade encryption protects data both in transit and at rest.</p>
          </FadeIn>
          <FadeIn delay={0.2}>
             <h4 className="font-serif italic text-xl text-slate-200 mb-2">HIPAA Ready</h4>
             <p className="text-slate-500 font-light text-sm">Architecture designed to meet and exceed strict healthcare compliance.</p>
          </FadeIn>
          <FadeIn delay={0.3}>
             <h4 className="font-serif italic text-xl text-slate-200 mb-2">FHIR Ready</h4>
             <p className="text-slate-500 font-light text-sm">Standardized interoperability for modern healthcare systems.</p>
          </FadeIn>
          <FadeIn delay={0.4}>
             <h4 className="font-serif italic text-xl text-slate-200 mb-2">Secure Cloud</h4>
             <p className="text-slate-500 font-light text-sm">Isolated, compliant infrastructure ensuring maximum uptime and security.</p>
          </FadeIn>
          <FadeIn delay={0.5}>
             <h4 className="font-serif italic text-xl text-slate-200 mb-2">Role Based Access</h4>
             <p className="text-slate-500 font-light text-sm">Strict permission controls limit data visibility to authorized personnel.</p>
          </FadeIn>
          <FadeIn delay={0.6}>
             <h4 className="font-serif italic text-xl text-slate-200 mb-2">Zero Training</h4>
             <p className="text-slate-500 font-light text-sm">Your patient data is never used to train our foundational AI models.</p>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}

const faqs = [
  {
    q: 'How accurate is medical transcription?',
    a: 'Our models are specifically trained on vast medical corpuses. From complex pharmacology to rare diagnoses and varied accents, NovaScribe achieves state-of-the-art accuracy specifically for clinical settings.'
  },
  {
    q: 'Which languages are supported?',
    a: 'NovaScribe currently supports English, Spanish, French, German, and Mandarin. We are continually adding support for more languages to serve diverse patient populations.'
  },
  {
    q: 'Can I edit AI reports?',
    a: 'Absolutely. NovaScribe generates a highly accurate first draft, but you retain full control. Our minimalist editor allows you to quickly adjust the note before final export.'
  },
  {
    q: 'Can I upload recorded consultations?',
    a: 'Yes, you can upload existing audio files securely. The system will process them with the same clinical intelligence as live ambient recordings.'
  },
  {
    q: 'Is patient data encrypted?',
    a: 'Yes. All data is encrypted in transit and at rest using AES-256 standards. Patient privacy is our foundational priority.'
  },
  {
    q: 'Can multiple doctors use one clinic?',
    a: 'Yes, our clinic plans allow for multiple physician seats with centralized billing and role-based access controls for administrative staff.'
  },
  {
    q: 'Will EMR integration be available?',
    a: 'We are actively developing direct EHR integrations with major providers like Epic, Cerner, and Athena. Currently, you can easily copy structured text or export to PDF.'
  }
];

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="py-16 md:py-24 bg-[#0B0F1F]" id="faq">
      <div className="max-w-[800px] mx-auto px-6">
        <FadeIn className="mb-16 text-center md:text-left">
          <h2 className="text-5xl md:text-7xl font-medium tracking-tight text-white mb-6 leading-[1.05]">
            Common <span className="font-serif italic font-light text-[#4F6BFF]">questions.</span>
          </h2>
        </FadeIn>

        <div className="space-y-2 border-t border-white/5">
          {faqs.map((faq, i) => (
            <FadeIn key={`faq-${i}`} delay={i * 0.1}>
              <div className="border-b border-white/5 py-6">
                <button 
                  className="w-full flex items-start justify-between text-left focus:outline-none group"
                  onClick={() => setOpenIndex(openIndex === i ? null : i)}
                >
                  <span className={`text-2xl md:text-3xl font-medium pr-8 transition-colors ${openIndex === i ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`}>{faq.q}</span>
                  <div className="shrink-0 w-8 h-8 flex items-center justify-center mt-1">
                    {openIndex === i ? <Minus className="w-6 h-6 text-[#4F6BFF]" /> : <Plus className="w-6 h-6 text-slate-600" />}
                  </div>
                </button>
                <AnimatePresence>
                  {openIndex === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
                      className="overflow-hidden"
                    >
                      <div className="pt-6 pb-2 text-xl text-slate-400 font-light leading-relaxed max-w-2xl">
                        {faq.a}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
