import { useEffect, useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'motion/react';
import { FileText, Pill, MessageSquare, Check, Printer, Send } from 'lucide-react';
import { Reveal, SectionHead } from './primitives';
import NovaPhoneDemo from './NovaPhoneDemo';
import { SCENES, INDIC_FONT } from './scenes';

// Section 3 — the product running, not a screenshot of it. Two panels, side by
// side: the phone plays the consultation (record → transcript → note), and beside
// it the outputs it produces (clinical note, prescription, patient summary).
//
// It used to stack the phone ABOVE a second full desktop demo of the same flow —
// the same thing twice, and a very tall section. The phone is the flow; this keeps
// only the phone plus what it produces.

// This visit is spoken in Hindi, so the transcript is in Devanagari — the product
// transcribes into the script the language is actually written in, never romanised.
const SCENE = SCENES[0];

const TABS = [
  { key: 'note', label: 'Clinical note', icon: FileText },
  { key: 'rx', label: 'Prescription', icon: Pill },
  { key: 'summary', label: 'Patient summary', icon: MessageSquare },
] as const;

export function LiveDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.3 });
  const reduce = useReducedMotion();
  // The right panel cycles through the three outputs continuously. It used to sit
  // empty (skeleton bars) for the first few beats while it waited to "catch up"
  // with the phone — which just read as a blank card. Now it always shows one.
  const [tabIndex, setTabIndex] = useState(0);

  useEffect(() => {
    if (reduce || !inView) return;
    const id = setInterval(() => setTabIndex((t) => (t + 1) % TABS.length), 2800);
    return () => clearInterval(id);
  }, [inView, reduce]);

  return (
    <section ref={ref} id="live-demo" className="relative py-20 bg-slate-50 border-y border-slate-100 overflow-hidden">
      {/* A doctor using their phone, behind the flow — the human it's built for.
          Sits on the right (where the layout is emptiest), clearly visible but
          scrimmed toward the copy so the phone and card stay readable. */}
      <div aria-hidden className="absolute inset-0 pointer-events-none">
        <img
          src="/images/doctor-1.jpg"
          alt=""
          className="absolute right-0 top-0 h-full w-full lg:w-[55%] object-cover object-center opacity-[0.22]"
        />
        {/* Fade the photo into the section on its left edge and soften the rest. */}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-50 via-slate-50/80 to-slate-50/35" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-50/70 via-transparent to-slate-50/45" />
      </div>

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHead
          eyebrow="Live demo"
          title="Watch a consultation"
          accent="become a complete record."
          sub="No screenshots — this is the flow exactly as it runs in the app."
        />

        {/* Two panels, side by side: the phone plays the flow; beside it, what it
            produces. On mobile they stack, phone first. */}
        <div className="mt-12 grid lg:grid-cols-2 gap-8 lg:gap-10 items-center">
          <Reveal delay={0.05}>
            <div className="flex justify-center">
              <NovaPhoneDemo autoPlayInView />
            </div>
          </Reveal>

          <Reveal delay={0.12}>
            <div className="rounded-3xl bg-white border border-slate-200 shadow-xl shadow-slate-900/5 overflow-hidden">
              <div className="p-6 sm:p-7">
                <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-4">
                  What it produces
                </div>
                <div className="flex flex-wrap gap-1.5 mb-5">
                  {TABS.map((t, i) => {
                    const Icon = t.icon;
                    const active = tabIndex === i;
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setTabIndex(i)}
                        className={`flex items-center gap-1.5 text-[11px] font-bold rounded-full px-3 py-1.5 transition-colors duration-300 ${
                          active
                            ? 'bg-slate-900 text-white'
                            : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <Icon className="w-3 h-3" />
                        {t.label}
                      </button>
                    );
                  })}
                </div>

                <div className="min-h-[260px]">

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
                          {/* The patient reads this, so it goes out in the language they
                              spoke — not the English the clinical note is filed in. */}
                          <div className="flex items-center gap-1.5 pb-1">
                            <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5">
                              In the patient's language
                            </span>
                            <span className="text-[11px] font-bold text-slate-700" style={{ fontFamily: INDIC_FONT }}>
                              {SCENE.native}
                            </span>
                          </div>
                          <p className="text-[12.5px] text-slate-700 leading-relaxed" style={{ fontFamily: INDIC_FONT }}>
                            {SCENE.patientLine}
                          </p>
                          <p className="text-[12.5px] text-slate-700 leading-relaxed" style={{ fontFamily: INDIC_FONT }}>
                            अगर बुख़ार तीन दिन से ज़्यादा रहे तो दोबारा दिखाएँ।
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
          </Reveal>
        </div>
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
