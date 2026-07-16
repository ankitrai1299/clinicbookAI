import { FadeIn } from './ui/FadeIn';
import { motion, useScroll, useTransform, AnimatePresence } from 'motion/react';
import { ArrowRight, Sparkles, Stethoscope, FileText, Activity, Check } from 'lucide-react';
import { useRef, useState, useEffect } from 'react';

export function Hero() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end start'],
  });

  const y = useTransform(scrollYProgress, [0, 1], [0, 150]);
  const opacity = useTransform(scrollYProgress, [0, 0.5, 1], [1, 0.3, 0]);

  // Consultation Simulation State
  const [step, setStep] = useState(0);

  useEffect(() => {
    const sequence = async () => {
      while (true) {
        setStep(0); // Doctor starts speaking
        await new Promise(r => setTimeout(r, 2000));
        setStep(1); // Waveform reacts & Transcript types
        await new Promise(r => setTimeout(r, 3000));
        setStep(2); // Symptoms highlighted
        await new Promise(r => setTimeout(r, 2000));
        setStep(3); // AI Extracts entities
        await new Promise(r => setTimeout(r, 2500));
        setStep(4); // SOAP builds & Export
        await new Promise(r => setTimeout(r, 4000));
      }
    };
    sequence();
  }, []);

  return (
    <section 
      ref={containerRef}
      className="relative min-h-[100vh] flex flex-col justify-start pt-24 md:pt-32 overflow-hidden bg-[#FAFBFD]"
    >
      {/* Background Ambience */}
      <div className="absolute inset-0 pointer-events-none -z-10">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-[#4F6BFF]/5 blur-[120px] rounded-full mix-blend-multiply" />
        <div className="absolute top-[20%] right-[-10%] w-[50%] h-[70%] bg-[#0B0F1F]/5 blur-[140px] rounded-full mix-blend-multiply" />
      </div>

      <div className="max-w-[1000px] w-full mx-auto px-6 relative z-10 flex flex-col items-center">
        
        {/* Typography Hero */}
        <motion.div style={{ y, opacity }} className="text-center w-full mx-auto z-20">
          <FadeIn>
            <h1 className="text-6xl md:text-[90px] lg:text-[110px] tracking-tight text-[#111827] leading-[1.05] font-medium mb-6">
              The AI Scribe <br />
              <span className="font-serif italic font-light text-[#111827]">
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#6A71DF] to-[#867EE0] drop-shadow-[0_0_12px_rgba(106,113,223,0.06)]">for the modern</span> physician.
              </span>
            </h1>
          </FadeIn>
          
          <FadeIn delay={0.2}>
            <p className="text-xl md:text-2xl text-slate-500 leading-relaxed mb-8 max-w-2xl mx-auto font-light">
              Record every consultation once. NovaScribe listens, transcribes, understands medical context and automatically generates structured clinical documentation—so doctors can focus on patients, not paperwork.
            </p>
          </FadeIn>
          
          <FadeIn delay={0.4} className="flex flex-col sm:flex-row gap-5 justify-center items-center">
            <button className="px-8 py-4 text-sm uppercase tracking-widest font-bold text-white bg-[#0B0F1F] rounded-full hover:bg-black transition-all active:scale-95 shadow-[0_8px_30px_rgba(11,15,31,0.2)] flex items-center justify-center gap-2 group relative overflow-hidden">
              <span className="relative z-10 flex items-center gap-2">
                Start Free <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </span>
            </button>
            <button className="px-8 py-4 text-sm uppercase tracking-widest font-bold text-[#0B0F1F] bg-white/40 backdrop-blur-md border border-[#0B0F1F]/10 rounded-full hover:bg-white transition-all active:scale-95 shadow-sm flex items-center justify-center gap-2">
              Book Demo
            </button>
          </FadeIn>

          <FadeIn delay={0.6} className="mt-8 flex flex-wrap justify-center gap-6">
            {['No credit card', '2-minute setup', 'HIPAA Ready', 'FHIR Ready'].map((feature, i) => (
              <div key={feature} className="flex items-center gap-2 text-sm font-medium text-slate-500">
                <Check className="w-4 h-4 text-[#4F6BFF]" />
                {feature}
              </div>
            ))}
          </FadeIn>
        </motion.div>

        {/* Cinematic Live Consultation Simulation */}
        <div className="w-full mt-16 md:mt-24 relative z-10 perspective-[2000px]">
          <FadeIn delay={0.6} className="w-full relative">
            <div className="absolute inset-0 bg-gradient-to-t from-[#FAFBFD] via-[#FAFBFD]/50 to-transparent z-30 h-[150%] pointer-events-none translate-y-[30%]" />
            
            <motion.div 
              initial={{ rotateX: 15, y: 100, opacity: 0 }}
              animate={{ rotateX: 0, y: 0, opacity: 1 }}
              transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
              className="w-full mx-auto bg-white/70 backdrop-blur-2xl rounded-3xl md:rounded-[40px] shadow-[0_30px_100px_rgba(11,15,31,0.07)] border border-white relative overflow-hidden"
            >
              {/* Fake UI Header */}
              <div className="flex items-center justify-between px-8 py-6 border-b border-[#0B0F1F]/5 bg-white/40">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                    <span className="font-mono text-xs font-medium tracking-widest text-slate-500 uppercase">Live REC</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 opacity-50">
                   {[...Array(24)].map((_, i) => (
                      <motion.div 
                        key={`bar-${i}`}
                        className="w-1 bg-[#4F6BFF] rounded-full"
                        animate={{ 
                          height: step >= 1 ? ['4px', `${Math.random() * 24 + 4}px`, '4px'] : '4px',
                          opacity: step >= 1 ? 1 : 0.3
                        }}
                        transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.05, ease: "easeInOut" }}
                      />
                    ))}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-px bg-[#0B0F1F]/5">
                {/* Left Side: Live Transcript */}
                <div className="bg-white/60 p-8 md:p-12 min-h-[400px] flex flex-col justify-end relative overflow-hidden">
                  <div className="space-y-8 font-sans text-xl md:text-2xl leading-relaxed text-[#111827]">
                    
                    <AnimatePresence mode="popLayout">
                      {step >= 1 && (
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex flex-col gap-2"
                        >
                          <span className="text-xs font-bold tracking-widest text-slate-400 uppercase">Dr. Sarah</span>
                          <p>"How have you been feeling since we adjusted the <motion.span animate={{ backgroundColor: step >= 2 ? 'rgba(79, 107, 255, 0.1)' : 'transparent', color: step >= 2 ? '#4F6BFF' : '#111827' }} className="px-1 rounded transition-colors duration-500">Lisinopril</motion.span>?"</p>
                        </motion.div>
                      )}
                      
                      {step >= 2 && (
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 1 }}
                          className="flex flex-col gap-2"
                        >
                          <span className="text-xs font-bold tracking-widest text-[#4F6BFF] uppercase">Patient</span>
                          <p className="text-slate-600">"Much better. The <motion.span animate={{ backgroundColor: step >= 3 ? 'rgba(239, 68, 68, 0.05)' : 'transparent', color: step >= 3 ? '#ef4444' : 'currentColor' }} className="px-1 rounded transition-colors duration-500">morning dizziness</motion.span> is completely gone."</p>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Extraction Overlay */}
                    <AnimatePresence>
                      {step >= 3 && step < 4 && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center"
                        >
                           <div className="flex flex-col items-center gap-4">
                             <div className="w-12 h-12 rounded-full bg-[#4F6BFF]/10 flex items-center justify-center">
                               <Activity className="w-5 h-5 text-[#4F6BFF] animate-spin" style={{ animationDuration: '3s' }} />
                             </div>
                             <span className="font-mono text-sm tracking-widest text-[#0B0F1F] uppercase">Extracting Entities</span>
                           </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Right Side: Generated SOAP */}
                <div className="bg-white/80 p-8 md:p-12 relative overflow-hidden">
                   <h3 className="font-serif italic text-3xl text-slate-300 mb-10">SOAP Note</h3>
                   
                   <div className="space-y-8">
                     <div className="space-y-4">
                       <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Subjective</h4>
                       <div className="relative">
                         <div className="absolute inset-0 bg-slate-100 rounded animate-pulse" />
                         <motion.p 
                           initial={{ opacity: 0 }}
                           animate={{ opacity: step >= 4 ? 1 : 0 }}
                           className="relative z-10 text-sm text-[#111827] leading-relaxed bg-white/90 p-3 rounded shadow-sm border border-slate-100"
                         >
                           Patient reports morning dizziness has resolved following the recent adjustment to Lisinopril dosage. Feeling overall improvement.
                         </motion.p>
                       </div>
                     </div>
                     
                     <div className="space-y-4">
                       <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Assessment</h4>
                       <div className="flex gap-2">
                         <motion.span 
                           initial={{ scale: 0.8, opacity: 0 }}
                           animate={{ scale: step >= 4 ? 1 : 0.8, opacity: step >= 4 ? 1 : 0 }}
                           transition={{ delay: 0.2 }}
                           className="px-3 py-1.5 bg-[#4F6BFF]/10 text-[#4F6BFF] text-xs font-bold tracking-wide rounded-md border border-[#4F6BFF]/20"
                         >
                           Hypertension (Resolved Symptoms)
                         </motion.span>
                         <motion.span 
                           initial={{ scale: 0.8, opacity: 0 }}
                           animate={{ scale: step >= 4 ? 1 : 0.8, opacity: step >= 4 ? 1 : 0 }}
                           transition={{ delay: 0.4 }}
                           className="px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-bold tracking-wide rounded-md border border-slate-200"
                         >
                           Medication Tolerated Well
                         </motion.span>
                       </div>
                     </div>
                   </div>
                   
                   <AnimatePresence>
                      {step >= 4 && (
                        <motion.div 
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.8 }}
                          className="absolute bottom-8 right-8"
                        >
                          <div className="flex items-center gap-2 px-4 py-2 bg-[#0B0F1F] text-white rounded-full shadow-lg">
                            <Sparkles className="w-4 h-4 text-[#4F6BFF]" />
                            <span className="text-xs font-bold tracking-widest uppercase">Export Ready</span>
                          </div>
                        </motion.div>
                      )}
                   </AnimatePresence>
                </div>
              </div>
            </motion.div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}

export function FinalCTA() {
  return (
    <section className="py-20 md:py-24 relative overflow-hidden bg-[#0B0F1F]">
      <div className="absolute inset-0 flex flex-col items-center justify-center opacity-20 pointer-events-none overflow-hidden mix-blend-screen">
        <div className="flex items-center gap-2 md:gap-3">
          {[...Array(80)].map((_, i) => (
             <motion.div 
               key={`bg-line-${i}`} 
               className="w-1 md:w-2 bg-[#4F6BFF] rounded-full blur-[1px]" 
               animate={{ 
                 height: ['20px', `${Math.random() * 300 + 50}px`, '20px'],
                 opacity: [0.3, 1, 0.3]
               }}
               transition={{ duration: 2 + Math.random() * 3, repeat: Infinity, ease: "easeInOut", delay: Math.random() * 2 }}
             />
          ))}
        </div>
      </div>
      
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#4F6BFF]/20 blur-[200px] rounded-full pointer-events-none" />

      <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
        <FadeIn>
          <h2 className="text-5xl md:text-7xl lg:text-[90px] font-medium tracking-tight text-white mb-6 leading-[1.05]">
            Spend less time <span className="font-serif italic font-light text-slate-400">documenting.</span><br />
            Spend more time <span className="font-serif italic font-light text-[#4F6BFF]">treating patients.</span>
          </h2>
        </FadeIn>
        
        <FadeIn delay={0.1}>
          <p className="text-xl md:text-2xl text-slate-400 mb-10 max-w-2xl mx-auto font-light leading-relaxed">
            Join clinics using NovaScribe to eliminate documentation burden and focus on better patient care.
          </p>
        </FadeIn>

        <FadeIn delay={0.2} className="flex flex-col sm:flex-row gap-5 justify-center items-center">
          <button className="px-10 py-5 text-sm uppercase tracking-widest font-bold text-[#0B0F1F] bg-white rounded-full hover:bg-slate-200 transition-all active:scale-95 shadow-[0_0_40px_rgba(255,255,255,0.2)] flex items-center justify-center gap-3 group">
            Start Free
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
          <button className="px-10 py-5 text-sm uppercase tracking-widest font-bold text-white bg-white/10 backdrop-blur-md border border-white/20 rounded-full hover:bg-white/20 transition-all active:scale-95 shadow-sm flex items-center justify-center gap-3">
            Book Demo
          </button>
        </FadeIn>
      </div>
    </section>
  );
}
