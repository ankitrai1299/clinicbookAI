import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useInView, useReducedMotion } from 'motion/react';
import { Mic, Clock, FileText, Pill, Check, Sparkles, Stethoscope, Send } from 'lucide-react';

// The DOCTOR's side of the platform, shown as the scribe's own UI rather than a
// WhatsApp thread — NovaScribe's work is recording a consultation and writing the
// clinical note, so that is what these scenes show.
//
// Each scene reveals its cards one at a time (same rhythm as the patient-side
// chat) so a viewer watches the work happen instead of reading a static mockup.

export type ScribeScene = 'queue' | 'record' | 'prescription';

interface Props {
  scene: ScribeScene;
  photo?: string;
  photoAlt?: string;
  speedMs?: number;
  loop?: boolean;
}

/** A floating white card — the shared surface for every scene. */
function Card({
  children,
  index,
  float,
  className = '',
}: {
  children: ReactNode;
  index: number;
  float: boolean;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className={className}
    >
      <motion.div
        animate={float ? { y: [0, -6, 0] } : undefined}
        transition={float ? { duration: 4.5, repeat: Infinity, ease: 'easeInOut', delay: index * 0.4 } : undefined}
        className="bg-white/95 backdrop-blur-[2px] border border-white rounded-2xl shadow-xl p-3.5"
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

const Label = ({ icon: Icon, children }: { icon: typeof Mic; children: ReactNode }) => (
  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
    <Icon className="w-3 h-3" /> {children}
  </div>
);

export default function ScribeVisual({ scene, photo, photoAlt, speedMs = 900, loop = false }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.3 });
  const reduce = useReducedMotion();

  // How many cards of this scene are visible.
  const total = scene === 'record' ? 4 : 3;
  const [shown, setShown] = useState(total);

  useEffect(() => {
    if (reduce) { setShown(total); return; }
    if (!inView) return;
    setShown(0);
    const id = setInterval(
      () => setShown((c) => (c >= total ? (loop ? 0 : c) : c + 1)),
      speedMs,
    );
    return () => clearInterval(id);
  }, [inView, total, reduce, loop, speedMs]);

  const float = !reduce;
  const at = (n: number) => shown >= n;

  return (
    <div
      ref={ref}
      className="relative rounded-3xl overflow-hidden min-h-[420px] sm:min-h-[460px] bg-gradient-to-br from-white/60 to-white/20"
    >
      {photo && (
        <motion.img
          src={photo}
          alt={photoAlt || ''}
          loading="lazy"
          decoding="async"
          whileHover={reduce ? undefined : { scale: 1.03 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="absolute inset-0 w-full h-full object-cover object-[75%_center]"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-white/85 via-white/40 to-transparent" />

      <div className="relative p-4 sm:p-5 space-y-2.5 max-w-[86%]">
        {/* ── TODAY'S QUEUE ── */}
        {scene === 'queue' && (
          <>
            {at(1) && (
              <Card index={0} float={float}>
                <div className="flex items-center justify-between">
                  <Label icon={Clock}>Today’s queue</Label>
                  <span className="text-[10px] font-bold text-sky-700 bg-sky-50 border border-sky-100 px-2 py-0.5 rounded-full">
                    3 waiting
                  </span>
                </div>
                <div className="space-y-1.5">
                  {[
                    { n: 'Priya Patel', t: '10:00 AM' },
                    { n: 'Anish Kumar', t: '10:30 AM' },
                  ].map((p, i) => (
                    <motion.div
                      key={p.n}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.15 + i * 0.12, duration: 0.35 }}
                      className="flex items-center gap-2.5"
                    >
                      <span className="w-7 h-7 rounded-full bg-sky-100 text-sky-700 text-[10px] font-bold flex items-center justify-center">
                        {p.n.charAt(0)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-semibold text-slate-800 truncate">{p.n}</div>
                        <div className="text-[10px] text-slate-400">{p.t}</div>
                      </div>
                      <span className="text-[10px] font-bold text-white bg-sky-600 px-2.5 py-1 rounded-md flex items-center gap-1">
                        <Mic className="w-3 h-3" /> Start
                      </span>
                    </motion.div>
                  ))}
                </div>
              </Card>
            )}

            {at(2) && (
              <Card index={1} float={float}>
                <Label icon={Stethoscope}>Booked on WhatsApp</Label>
                <p className="text-[12px] text-slate-700 leading-snug">
                  Every appointment arrives on its own — the doctor never creates one.
                </p>
              </Card>
            )}

            {at(3) && (
              <Card index={2} float={float} className="max-w-[85%]">
                <Label icon={FileText}>Visit context</Label>
                <p className="text-[12px] text-slate-700 leading-snug">
                  <span className="font-semibold">Last visit:</span> 12 days ago · on Amoxycillin ·
                  follow-up due
                </p>
              </Card>
            )}
          </>
        )}

        {/* ── RECORDING → NOTE ── */}
        {scene === 'record' && (
          <>
            {at(1) && (
              <Card index={0} float={float}>
                <div className="flex items-center gap-2.5">
                  <span className="relative flex-shrink-0">
                    <motion.span
                      animate={reduce ? undefined : { scale: [1, 1.35, 1], opacity: [0.5, 0, 0.5] }}
                      transition={reduce ? undefined : { duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                      className="absolute inset-0 rounded-full bg-red-400"
                    />
                    <span className="relative w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center">
                      <Mic className="w-4 h-4" />
                    </span>
                  </span>
                  <div className="flex-1">
                    <div className="text-[11px] font-bold text-slate-800">Recording consultation</div>
                    <div className="flex items-end gap-0.5 h-4 mt-1">
                      {Array.from({ length: 24 }).map((_, i) => (
                        <motion.span
                          key={i}
                          className="w-[3px] bg-sky-500 rounded-full"
                          animate={reduce ? { height: 5 } : { height: [4, 6 + ((i * 5) % 13), 4] }}
                          transition={
                            reduce
                              ? undefined
                              : { duration: 0.9, repeat: Infinity, delay: i * 0.05, ease: 'easeInOut' }
                          }
                        />
                      ))}
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">02:41</span>
                </div>
              </Card>
            )}

            {at(2) && (
              <Card index={1} float={float}>
                <Label icon={FileText}>Live transcript</Label>
                <div className="space-y-1">
                  <p className="text-[11px] text-slate-500">
                    <span className="font-bold text-slate-700">Doctor:</span> Dizziness kaisa hai ab?
                  </p>
                  <p className="text-[11px] text-slate-500">
                    <span className="font-bold text-sky-700">Patient:</span> Subah thoda hota hai, pehle se
                    kam.
                  </p>
                </div>
              </Card>
            )}

            {at(3) && (
              <Card index={2} float={float}>
                <div className="flex items-center gap-2">
                  <motion.span
                    animate={reduce ? undefined : { rotate: 360 }}
                    transition={reduce ? undefined : { duration: 3, repeat: Infinity, ease: 'linear' }}
                    className="w-6 h-6 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                  </motion.span>
                  <span className="text-[11px] font-bold text-slate-700">Writing the clinical note…</span>
                </div>
              </Card>
            )}

            {at(4) && (
              <Card index={3} float={float}>
                <Label icon={FileText}>Clinical note</Label>
                <p className="text-[10px] font-bold uppercase tracking-wide text-sky-600">Assessment</p>
                <p className="text-[11px] text-slate-700 leading-snug mb-2">
                  Orthostatic hypotension, likely secondary to the Lisinopril adjustment.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {['Reduce Lisinopril to 5mg', 'Monitor BP twice daily'].map((tag) => (
                    <span
                      key={tag}
                      className="text-[9px] font-semibold bg-teal-50 text-teal-700 border border-teal-100 px-2 py-0.5 rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}

        {/* ── PRESCRIPTION ── */}
        {scene === 'prescription' && (
          <>
            {at(1) && (
              <Card index={0} float={float}>
                <div className="flex items-center justify-between mb-2">
                  <Label icon={Pill}>Prescription</Label>
                  <span className="text-[9px] text-slate-400">Dr. Rohit Sharma</span>
                </div>
                {[
                  ['Amoxycillin 500mg', 'Twice daily · 5 days'],
                  ['Paracetamol 650mg', 'If fever · 3 days'],
                ].map(([drug, dose], i) => (
                  <motion.div
                    key={drug}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.15 + i * 0.12, duration: 0.35 }}
                    className="flex items-center justify-between py-0.5"
                  >
                    <span className="text-[11px] font-semibold text-slate-800">{drug}</span>
                    <span className="text-[10px] text-slate-400">{dose}</span>
                  </motion.div>
                ))}
              </Card>
            )}

            {at(2) && (
              <Card index={1} float={float}>
                <div className="flex items-center gap-2.5">
                  <span className="w-9 h-10 rounded bg-red-50 border border-red-100 text-red-600 text-[9px] font-bold flex items-center justify-center">
                    PDF
                  </span>
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-slate-800 truncate">
                      prescription_priya-patel.pdf
                    </div>
                    <div className="text-[10px] text-slate-400">1 page · signed</div>
                  </div>
                </div>
              </Card>
            )}

            {at(3) && (
              <Card index={2} float={float} className="max-w-[80%]">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <Send className="w-3 h-3" />
                  </span>
                  <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                    Sent to the patient
                    <Check className="w-3 h-3 text-emerald-600" />
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Medicine reminders scheduled automatically.
                </p>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
