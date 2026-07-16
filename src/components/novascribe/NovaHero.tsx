import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, Sparkles, Activity, Check, Smartphone, Stethoscope } from 'lucide-react';
import { FadeIn } from './FadeIn';

// NovaScribe landing hero — ClinicBook theme (light slate/white, sky→teal accent,
// font-display headings). Centrepiece is a looping "live consultation" simulation:
// transcript streams in on the left, the structured note builds on the right.

interface HeroProps {
  isLoggedIn: boolean;
  onOpen: () => void;
  apkUrl?: string;
}

export function NovaHero({ isLoggedIn, onOpen, apkUrl }: HeroProps) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      while (!cancelled) {
        setStep(0);
        await wait(1800);
        if (cancelled) return;
        setStep(1);
        await wait(2600);
        if (cancelled) return;
        setStep(2);
        await wait(2000);
        if (cancelled) return;
        setStep(3);
        await wait(2200);
        if (cancelled) return;
        setStep(4);
        await wait(4200);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="relative overflow-hidden bg-white pt-10 pb-20 lg:pt-16 lg:pb-24 border-b border-slate-100">
      {/* Decorative accents — same language as the ClinicBook hero */}
      <div className="absolute inset-0 z-0 bg-radial-at-t from-sky-50 via-white to-transparent opacity-70 pointer-events-none" />
      <div className="absolute top-24 right-10 w-96 h-96 bg-teal-100 rounded-full blur-3xl opacity-20 pointer-events-none" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <FadeIn className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-sky-50 border border-sky-100 text-sky-700 rounded-full text-xs font-semibold tracking-wide uppercase shadow-2xs">
            <Stethoscope className="w-4 h-4 text-sky-500" />
            <span>AI Medical Scribe</span>
          </div>

          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight leading-tight mt-6">
            The AI scribe for the
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-600 to-teal-600">
              modern physician.
            </span>
          </h1>

          <p className="text-lg text-slate-600 leading-relaxed mt-5 max-w-2xl mx-auto">
            Record every consultation once. NovaScribe listens, transcribes, understands the medical context and
            writes structured clinical documentation — so doctors focus on patients, not paperwork.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center mt-8">
            <button
              onClick={onOpen}
              className="px-8 py-4 bg-sky-600 text-white rounded-xl font-bold hover:bg-sky-700 shadow-lg shadow-sky-100 hover:shadow-xl transition-all duration-300 flex items-center justify-center gap-2 group cursor-pointer"
            >
              {isLoggedIn ? 'Open NovaScribe' : 'Sign in to start'}
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>

            {apkUrl ? (
              <a
                href={apkUrl}
                className="px-8 py-4 bg-white text-slate-700 border border-slate-200 rounded-xl font-bold hover:bg-slate-50 hover:border-slate-300 shadow-sm transition-all flex items-center justify-center gap-2"
              >
                <Smartphone className="w-4 h-4" /> Download Android App
              </a>
            ) : (
              <span className="px-8 py-4 bg-slate-100 text-slate-400 rounded-xl font-bold cursor-not-allowed flex items-center gap-2">
                <Smartphone className="w-4 h-4" /> Android app — coming soon
              </span>
            )}
          </div>

          <div className="mt-7 flex flex-wrap justify-center gap-x-6 gap-y-2">
            {['Works in Hindi, English & Hinglish', '2-minute setup', 'Shares ClinicBook patients'].map((f) => (
              <div key={f} className="flex items-center gap-1.5 text-sm font-medium text-slate-500">
                <Check className="w-4 h-4 text-teal-600" />
                {f}
              </div>
            ))}
          </div>
        </FadeIn>

        {/* Live consultation simulation */}
        <FadeIn delay={0.3} className="mt-14">
          <div className="rounded-3xl bg-white border border-slate-200 shadow-2xl shadow-slate-200/60 overflow-hidden">
            {/* Recorder bar */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">Live recording</span>
              </div>
              <div className="flex items-end gap-1 h-6">
                {Array.from({ length: 22 }).map((_, i) => (
                  <motion.span
                    key={i}
                    className="w-1 bg-sky-500 rounded-full"
                    animate={{
                      height: step >= 1 ? ['4px', `${8 + ((i * 7) % 18)}px`, '4px'] : '4px',
                      opacity: step >= 1 ? 1 : 0.35,
                    }}
                    transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.05, ease: 'easeInOut' }}
                  />
                ))}
              </div>
            </div>

            <div className="grid md:grid-cols-2">
              {/* Transcript */}
              <div className="p-6 sm:p-8 min-h-[320px] border-b md:border-b-0 md:border-r border-slate-100 relative">
                <h3 className="font-display font-bold text-slate-400 text-sm uppercase tracking-widest mb-5">
                  Live transcript
                </h3>
                <div className="space-y-5">
                  <AnimatePresence mode="popLayout">
                    {step >= 1 && (
                      <motion.div key="dr" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="space-y-1.5">
                        <span className="text-[11px] font-bold tracking-widest text-slate-400 uppercase">Dr. Sarah</span>
                        <p className="text-slate-800 leading-relaxed">
                          “How have you been feeling since we adjusted the{' '}
                          <motion.span
                            animate={{
                              backgroundColor: step >= 2 ? 'rgb(224 242 254)' : 'rgba(0,0,0,0)',
                              color: step >= 2 ? 'rgb(2 132 199)' : 'rgb(30 41 59)',
                            }}
                            className="px-1 rounded font-semibold"
                          >
                            Lisinopril
                          </motion.span>
                          ?”
                        </p>
                      </motion.div>
                    )}
                    {step >= 2 && (
                      <motion.div key="pt" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="space-y-1.5">
                        <span className="text-[11px] font-bold tracking-widest text-sky-600 uppercase">Patient</span>
                        <p className="text-slate-600 leading-relaxed">
                          “Much better. The{' '}
                          <motion.span
                            animate={{
                              backgroundColor: step >= 3 ? 'rgb(254 226 226)' : 'rgba(0,0,0,0)',
                              color: step >= 3 ? 'rgb(220 38 38)' : 'rgb(71 85 105)',
                            }}
                            className="px-1 rounded font-semibold"
                          >
                            morning dizziness
                          </motion.span>{' '}
                          is completely gone.”
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <AnimatePresence>
                  {step === 3 && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-white/85 backdrop-blur-[2px] flex items-center justify-center"
                    >
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-sky-50 flex items-center justify-center">
                          <Activity className="w-5 h-5 text-sky-600 animate-spin" style={{ animationDuration: '3s' }} />
                        </div>
                        <span className="text-xs font-bold tracking-widest text-slate-600 uppercase">
                          Understanding the visit
                        </span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Generated note */}
              <div className="p-6 sm:p-8 bg-slate-50/50 relative">
                <h3 className="font-display font-bold text-slate-400 text-sm uppercase tracking-widest mb-5">
                  Clinical note
                </h3>

                <div className="space-y-5">
                  <div>
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-sky-600 mb-2">Subjective</h4>
                    <div className="relative min-h-[64px]">
                      {step < 4 && <div className="absolute inset-0 bg-slate-200/60 rounded-xl animate-pulse" />}
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: step >= 4 ? 1 : 0 }}
                        className="relative text-sm text-slate-700 leading-relaxed bg-white p-3 rounded-xl border border-slate-100 shadow-xs"
                      >
                        Morning dizziness has resolved following the recent Lisinopril adjustment. Reports overall
                        improvement.
                      </motion.p>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-sky-600 mb-2">Assessment</h4>
                    <div className="flex flex-wrap gap-2">
                      {['Hypertension — symptoms resolved', 'Medication tolerated well'].map((tag, i) => (
                        <motion.span
                          key={tag}
                          initial={{ scale: 0.85, opacity: 0 }}
                          animate={{ scale: step >= 4 ? 1 : 0.85, opacity: step >= 4 ? 1 : 0 }}
                          transition={{ delay: 0.2 + i * 0.15 }}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-lg border ${
                            i === 0
                              ? 'bg-sky-50 text-sky-700 border-sky-100'
                              : 'bg-white text-slate-600 border-slate-200'
                          }`}
                        >
                          {tag}
                        </motion.span>
                      ))}
                    </div>
                  </div>
                </div>

                <AnimatePresence>
                  {step >= 4 && (
                    <motion.div
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.7 }}
                      className="mt-6 flex justify-end"
                    >
                      <span className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-full shadow-md shadow-teal-100">
                        <Sparkles className="w-4 h-4" />
                        <span className="text-[11px] font-bold tracking-widest uppercase">Ready to print</span>
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

export default NovaHero;
