import { useEffect, useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'motion/react';
import { Mic, FileText, Pill, MessageSquare, Sparkles, Check, Printer, Send } from 'lucide-react';
import { Reveal, SectionHead, Waveform } from './primitives';
import NovaPhoneDemo from './NovaPhoneDemo';

// Section 3 — the product running, not a screenshot of it. The consultation plays
// through: the patient speaks, the transcript lands, the note is written, the
// prescription is filled, the patient summary appears.

const TRANSCRIPT = [
  { who: 'Doctor', text: 'Aaiye, batayiye — kya taklif ho rahi hai?' },
  { who: 'Patient', text: 'Do din se gale mein dard hai aur bukhar bhi aa raha hai.' },
  { who: 'Doctor', text: 'Khaansi ya saans mein dikkat?' },
  { who: 'Patient', text: 'Halki khaansi hai. Saans theek hai.' },
];

const TABS = [
  { key: 'note', label: 'Clinical note', icon: FileText },
  { key: 'rx', label: 'Prescription', icon: Pill },
  { key: 'summary', label: 'Patient summary', icon: MessageSquare },
] as const;

export function LiveDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.3 });
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0); // 0..7

  useEffect(() => {
    if (reduce) { setStep(7); return; }
    if (!inView) return;
    const id = setInterval(() => setStep((s) => (s >= 7 ? 0 : s + 1)), 1500);
    return () => clearInterval(id);
  }, [inView, reduce]);

  const linesShown = Math.min(step, TRANSCRIPT.length);
  const thinking = step === 4;
  const tabIndex = step >= 7 ? 2 : step >= 6 ? 1 : step >= 5 ? 0 : -1;

  return (
    <section ref={ref} id="live-demo" className="py-24 bg-slate-50 border-y border-slate-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHead
          eyebrow="Live demo"
          title="Watch a consultation"
          accent="become a complete record."
          sub="No screenshots — this is the flow exactly as it runs in the app."
        />

        {/* The phone version leads — it's the same animation we record for reels,
            so the site and the marketing footage never drift apart. */}
        <Reveal delay={0.08}>
          <div className="mt-14 mb-14 flex justify-center">
            <NovaPhoneDemo />
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="rounded-3xl bg-white border border-slate-200 shadow-2xl shadow-slate-900/5 overflow-hidden">
            <div className="grid lg:grid-cols-2">
              {/* Left — the room */}
              <div className="p-6 sm:p-8 border-b lg:border-b-0 lg:border-r border-slate-100">
                <div className="flex items-center gap-3 mb-6">
                  <span className="relative flex-shrink-0">
                    <motion.span
                      animate={reduce ? undefined : { scale: [1, 1.4, 1], opacity: [0.45, 0, 0.45] }}
                      transition={reduce ? undefined : { duration: 2, repeat: Infinity }}
                      className="absolute inset-0 rounded-full bg-red-400"
                    />
                    <span className="relative w-10 h-10 rounded-full bg-red-500 text-white flex items-center justify-center">
                      <Mic className="w-4.5 h-4.5" />
                    </span>
                  </span>
                  <div>
                    <div className="text-sm font-bold text-slate-800">Recording</div>
                    <div className="text-[11px] text-slate-400">Auto-detecting language</div>
                  </div>
                  <Waveform active className="text-emerald-500 h-7 ml-auto" bars={20} />
                </div>

                <div className="space-y-4 min-h-[260px]">
                  {TRANSCRIPT.slice(0, linesShown).map((l, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4 }}
                      className="space-y-1"
                    >
                      <span
                        className={`text-[10px] font-bold uppercase tracking-widest ${
                          l.who === 'Doctor' ? 'text-slate-400' : 'text-emerald-600'
                        }`}
                      >
                        {l.who}
                      </span>
                      <p className="text-[13px] text-slate-700 leading-relaxed">{l.text}</p>
                    </motion.div>
                  ))}

                  {thinking && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center gap-2 pt-2"
                    >
                      <motion.span
                        animate={reduce ? undefined : { rotate: 360 }}
                        transition={reduce ? undefined : { duration: 3, repeat: Infinity, ease: 'linear' }}
                        className="w-6 h-6 rounded-full bg-violet-50 text-violet-600 flex items-center justify-center"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                      </motion.span>
                      <span className="text-[12px] font-semibold text-slate-500">
                        Understanding symptoms, duration and severity…
                      </span>
                    </motion.div>
                  )}
                </div>
              </div>

              {/* Right — what gets produced */}
              <div className="p-6 sm:p-8 bg-slate-50/50">
                <div className="flex gap-1.5 mb-5">
                  {TABS.map((t, i) => {
                    const Icon = t.icon;
                    const active = tabIndex === i;
                    const done = tabIndex > i;
                    return (
                      <div
                        key={t.key}
                        className={`flex items-center gap-1.5 text-[11px] font-bold rounded-full px-3 py-1.5 transition-colors duration-300 ${
                          active
                            ? 'bg-slate-900 text-white'
                            : done
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                              : 'bg-white text-slate-400 border border-slate-200'
                        }`}
                      >
                        {done ? <Check className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
                        {t.label}
                      </div>
                    );
                  })}
                </div>

                <div className="min-h-[260px]">
                  {tabIndex < 0 && (
                    <div className="space-y-2.5 pt-2">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="h-12 rounded-xl bg-slate-200/70 animate-pulse" />
                      ))}
                    </div>
                  )}

                  {tabIndex >= 0 && (
                    <motion.div
                      key={tabIndex}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.45 }}
                      className="space-y-3"
                    >
                      {tabIndex === 0 && (
                        <>
                          {[
                            ['Chief complaint', 'Sore throat and fever for 2 days, with mild cough.'],
                            ['Assessment', 'Acute pharyngitis, likely viral. No respiratory distress.'],
                            ['Plan', 'Symptomatic treatment. Review if fever persists beyond 3 days.'],
                          ].map(([h, b]) => (
                            <div key={h} className="bg-white rounded-xl border border-slate-100 p-3">
                              <p className="text-[9px] font-bold uppercase tracking-wide text-sky-600 mb-1">{h}</p>
                              <p className="text-[12px] text-slate-700 leading-snug">{b}</p>
                            </div>
                          ))}
                        </>
                      )}

                      {tabIndex === 1 && (
                        <div className="bg-white rounded-xl border border-slate-100 p-3">
                          {[
                            ['Paracetamol 650mg', 'TDS · 3 days', 'After food'],
                            ['Warm saline gargle', 'Twice daily', '5 days'],
                          ].map(([d, f, n]) => (
                            <div key={d} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                              <span className="text-[12px] font-semibold text-slate-800">{d}</span>
                              <span className="text-[11px] text-slate-500">{f}</span>
                              <span className="text-[10px] text-slate-400">{n}</span>
                            </div>
                          ))}
                          <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-100">
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="text-[11px] font-semibold text-emerald-700">
                              No allergy or interaction conflicts
                            </span>
                          </div>
                        </div>
                      )}

                      {tabIndex === 2 && (
                        <div className="bg-white rounded-xl border border-slate-100 p-3 space-y-2">
                          <p className="text-[12px] text-slate-700 leading-relaxed">
                            You have a throat infection. Take Paracetamol after food when you have fever, and
                            gargle with warm salt water twice a day.
                          </p>
                          <p className="text-[12px] text-slate-700 leading-relaxed">
                            Come back if the fever continues for more than 3 days.
                          </p>
                          <div className="flex items-center gap-2 pt-1">
                            <span className="text-[10px] font-bold text-white bg-emerald-600 rounded-full px-2.5 py-1 flex items-center gap-1">
                              <Send className="w-3 h-3" /> Sent on WhatsApp
                            </span>
                            <span className="text-[10px] text-slate-400">with the prescription PDF</span>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ── S6 · A REAL REPORT ───────────────────────────────────────
export function RealReport() {
  return (
    <section className="py-24 bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHead
          eyebrow="The output"
          title="A report that reads like"
          accent="a clinician wrote it."
          sub="Structured, signed and print-ready — the same document you hand over, print, or send."
        />

        <Reveal delay={0.1}>
          <div className="mt-14 rounded-2xl bg-white border border-slate-200 shadow-2xl shadow-slate-900/5 overflow-hidden">
            {/* Letterhead */}
            <div className="px-7 py-5 border-b border-slate-200 flex items-start justify-between">
              <div>
                <div className="font-display text-lg font-extrabold text-slate-900">CarePlus Clinic</div>
                <div className="text-[11px] text-slate-500">
                  Dr. Rohit Sharma · MBBS, MD (General Medicine) · Reg. 45213
                </div>
              </div>
              <div className="text-right text-[11px] text-slate-500">
                <div>20 July 2026</div>
                <div>OPD · 11:04 AM</div>
              </div>
            </div>

            {/* Patient strip */}
            <div className="px-7 py-3 bg-slate-50 border-b border-slate-100 flex flex-wrap gap-x-8 gap-y-1 text-[12px]">
              {[
                ['Patient', 'Priya Patel'],
                ['Age / Sex', '34 / F'],
                ['Phone', '+91 98••• ••210'],
              ].map(([k, v]) => (
                <span key={k}>
                  <span className="text-slate-400">{k}: </span>
                  <span className="font-semibold text-slate-800">{v}</span>
                </span>
              ))}
            </div>

            <div className="p-7 space-y-5">
              {[
                { h: 'Chief complaint', b: 'Sore throat and fever for 2 days. Mild cough. No breathlessness.' },
                { h: 'History', b: 'No known drug allergies. No chronic illness. Non-smoker.' },
              ].map((s) => (
                <div key={s.h}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-sky-600 mb-1.5">{s.h}</p>
                  <p className="text-[13px] text-slate-700 leading-relaxed">{s.b}</p>
                </div>
              ))}

              {/* Vitals */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-sky-600 mb-2">Vitals</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    ['Temp', '100.8 °F'],
                    ['BP', '118/76'],
                    ['Pulse', '88 / min'],
                    ['SpO₂', '98%'],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                      <div className="text-[10px] text-slate-400">{k}</div>
                      <div className="text-[13px] font-bold text-slate-800 tabular-nums">{v}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-sky-600 mb-1.5">Assessment</p>
                <p className="text-[13px] text-slate-700 leading-relaxed">
                  Acute pharyngitis, likely viral. No features suggesting bacterial involvement.
                </p>
              </div>

              {/* Rx table */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-violet-600 mb-2">
                  Prescription
                </p>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-[12px] min-w-[420px]">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500">
                        {['Medicine', 'Dose', 'Frequency', 'Duration'].map((h) => (
                          <th key={h} className="text-left font-semibold px-3 py-2">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="text-slate-700">
                      {[
                        ['Paracetamol 650mg', '1 tab', 'TDS, after food', '3 days'],
                        ['Warm saline gargle', '—', 'Twice daily', '5 days'],
                      ].map((r) => (
                        <tr key={r[0]} className="border-t border-slate-100">
                          {r.map((c, i) => (
                            <td key={i} className={`px-3 py-2 ${i === 0 ? 'font-semibold text-slate-800' : ''}`}>{c}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-sky-600 mb-1.5">Advice</p>
                <ul className="text-[13px] text-slate-700 space-y-1 list-disc list-inside">
                  <li>Plenty of warm fluids and rest.</li>
                  <li>Return if fever persists beyond 3 days or breathing becomes difficult.</li>
                </ul>
              </div>

              {/* Signature */}
              <div className="pt-4 flex items-end justify-between border-t border-slate-100">
                <div className="text-[11px] text-slate-400">Follow-up: after 3 days if symptoms persist</div>
                <div className="text-right">
                  <div className="font-display italic text-slate-700">Dr. Rohit Sharma</div>
                  <div className="text-[10px] text-slate-400">Digitally signed</div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="px-7 py-4 bg-slate-50 border-t border-slate-100 flex flex-wrap gap-2">
              {[
                { icon: Printer, label: 'Print' },
                { icon: FileText, label: 'Download PDF' },
                { icon: Send, label: 'Send on WhatsApp' },
              ].map((a) => {
                const Icon = a.icon;
                return (
                  <span
                    key={a.label}
                    className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-1.5"
                  >
                    <Icon className="w-3.5 h-3.5" /> {a.label}
                  </span>
                );
              })}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
