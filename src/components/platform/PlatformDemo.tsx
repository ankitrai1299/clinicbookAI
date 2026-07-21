import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'motion/react';
import {
  MessageSquare, Mic, FileText, CalendarClock, Check, Sparkles,
  Pill, ArrowRight, ShieldCheck, Bell,
} from 'lucide-react';
import { SCENES, INDIC_FONT } from '../novascribe/v2/scenes';

// The two apps, running side by side on ONE clock.
//
// Two static mockups sat here before, which showed what each app looks like but
// not the thing that actually matters: that they are the same visit. So the panels
// now play in sequence — the doctor records and the note writes itself, the
// prescription is signed, and only THEN does the patient's WhatsApp light up with
// the PDF. The handoff between the panels is the product.
//
// One timeline drives both sides, so they can never fall out of step.

const SCENE = SCENES[0]; // the visit is spoken in Hindi

const B = {
  idle: 0,
  start: 1,   // doctor taps Start on the queue
  l1: 2, l2: 3, l3: 4,
  think: 5,   // model understands the visit
  note: 6,    // clinical note written
  rx: 7,      // prescription signed
  handoff: 8, // ── the moment the two apps meet ──
  ask: 9,     // patient asks for it on WhatsApp
  pdf: 10,    // PDF delivered
  remind: 11, // reminders scheduled
} as const;
const LAST = B.remind;

/** Messages already in the thread from when this visit was booked. */
const HISTORY = [
  { from: 'in' as const, text: 'Booked ✅ Tue 10:00 AM.\nWe’ll remind you the evening before.' },
];

export default function PlatformDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.25 });
  const reduce = useReducedMotion();
  const [beat, setBeat] = useState(0);

  useEffect(() => {
    if (reduce) { setBeat(LAST); return; }
    if (!inView) return;
    let cancelled = false;
    const timers: number[] = [];
    const wait = (ms: number) => new Promise<void>((r) => timers.push(window.setTimeout(r, ms)));

    (async () => {
      while (!cancelled) {
        setBeat(0);
        await wait(900);
        for (let b = 1; b <= LAST && !cancelled; b++) {
          setBeat(b);
          // Linger on the beats that carry meaning: the model thinking, and the
          // handoff — that pause is what makes the two panels read as one story.
          await wait(b === B.think ? 1800 : b === B.handoff ? 1500 : 1300);
        }
        await wait(3000);
      }
    })();
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [inView, reduce]);

  const at = (b: number) => beat >= b;
  const recording = beat >= B.start && beat < B.think;
  const lines = Math.max(0, Math.min(3, beat - B.l1 + 1));
  const doctorTurn = beat > B.idle && beat < B.handoff;
  const patientTurn = at(B.handoff);

  return (
    <div ref={ref}>
      {/* Which half of the story we're in — a caption, so the sequence is legible
          even to someone who looks away and back. */}
      <div className="flex items-center justify-center gap-2 sm:gap-3 mb-6">
        {[
          { n: '1', label: 'Doctor consults', active: doctorTurn, done: patientTurn, tone: 'sky' },
          { n: '2', label: 'Patient receives', active: patientTurn, done: false, tone: 'emerald' },
        ].map((s, i) => (
          <div key={s.n} className="flex items-center gap-2 sm:gap-3">
            {i > 0 && (
              <motion.span
                animate={{ opacity: patientTurn ? 1 : 0.3, x: patientTurn ? [0, 4, 0] : 0 }}
                transition={{ duration: 1.2, repeat: patientTurn ? Infinity : 0 }}
              >
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </motion.span>
            )}
            <motion.div
              animate={{ scale: s.active ? 1 : 0.96, opacity: s.active || s.done ? 1 : 0.45 }}
              transition={{ duration: 0.4 }}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 ${
                s.active
                  ? s.tone === 'sky'
                    ? 'bg-sky-600 border-sky-600 text-white'
                    : 'bg-emerald-600 border-emerald-600 text-white'
                  : 'bg-white border-slate-200 text-slate-500'
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-white/25 text-[9px] font-bold flex items-center justify-center">
                {s.done ? <Check className="w-2.5 h-2.5" /> : s.n}
              </span>
              <span className="text-[11px] sm:text-xs font-bold whitespace-nowrap">{s.label}</span>
            </motion.div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6 lg:gap-8 items-stretch">
        {/* ══ DOCTOR SIDE ══ */}
        <motion.div
          animate={{ opacity: patientTurn ? 0.72 : 1 }}
          transition={{ duration: 0.6 }}
          className={`rounded-3xl border p-5 sm:p-7 flex flex-col transition-colors duration-500 ${
            doctorTurn ? 'bg-white border-sky-200 shadow-xl shadow-sky-500/5' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="w-8 h-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center">
              <Mic className="w-4 h-4" />
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-sky-700">Doctor side</span>
          </div>
          <h3 className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 mt-2">
            NovaScribe — the AI scribe
          </h3>
          <p className="text-slate-600 text-sm mt-2 mb-5">
            One tap to record. The clinical note and prescription write themselves.
          </p>

          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden flex flex-col flex-1 min-h-[400px]">
            {/* Queue */}
            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 flex-shrink-0">
              <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                <CalendarClock className="w-3.5 h-3.5 text-sky-600" /> Today’s Queue
              </span>
              <span className="text-[10px] font-bold text-sky-700 bg-sky-50 border border-sky-100 px-2 py-0.5 rounded-full">
                3 waiting
              </span>
            </div>

            <div className="px-4 py-2.5 flex items-center gap-3 border-b border-slate-100 flex-shrink-0">
              <span className="relative flex-shrink-0">
                {recording && !reduce && (
                  <motion.span
                    animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="absolute inset-0 rounded-full bg-red-400"
                  />
                )}
                <span
                  className={`relative w-8 h-8 rounded-full text-[11px] font-bold flex items-center justify-center transition-colors ${
                    recording ? 'bg-red-500 text-white' : 'bg-sky-100 text-sky-700'
                  }`}
                >
                  P
                </span>
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-800 truncate">Priya Patel</div>
                <div className="text-[10px] text-slate-500">
                  34 / F · 10:00 AM
                  {recording && <span className="text-red-500 font-semibold"> · recording</span>}
                </div>
              </div>
              <motion.span
                animate={{ scale: beat === B.start ? [1, 0.9, 1] : 1 }}
                className={`text-[10px] font-bold px-2.5 py-1 rounded-md flex items-center gap-1 ${
                  recording ? 'bg-red-500 text-white' : at(B.note) ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-600 text-white'
                }`}
              >
                {at(B.note) ? <><Check className="w-3 h-3" /> Done</> : <><Mic className="w-3 h-3" /> {recording ? 'Rec' : 'Start'}</>}
              </motion.span>
            </div>

            {/* Body — transcript, then the note */}
            <div className="flex-1 relative overflow-hidden">
              <AnimatePresence mode="wait">
                {!at(B.note) ? (
                  <motion.div
                    key="rec"
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    transition={{ duration: 0.4 }}
                    className="absolute inset-0 p-4 space-y-2.5 overflow-hidden"
                  >
                    {beat < B.l1 && (
                      <p className="text-[11px] text-slate-400 text-center pt-16">
                        Tap Start and just talk to the patient.
                      </p>
                    )}
                    {SCENE.transcript.slice(0, lines).map((l, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4 }}
                        className={`max-w-[88%] rounded-2xl px-3 py-2 ${
                          l.who === 'Doctor'
                            ? 'bg-slate-100 rounded-tl-sm'
                            : 'bg-emerald-50 ml-auto rounded-tr-sm'
                        }`}
                      >
                        <div
                          className={`text-[8px] font-bold uppercase tracking-widest mb-0.5 ${
                            l.who === 'Doctor' ? 'text-slate-400' : 'text-emerald-600'
                          }`}
                        >
                          {l.who}
                        </div>
                        <p className="text-[11.5px] text-slate-800 leading-relaxed" style={{ fontFamily: INDIC_FONT }}>
                          {l.text}
                        </p>
                      </motion.div>
                    ))}

                    {beat === B.think && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 pt-1">
                        <motion.span
                          animate={reduce ? undefined : { rotate: 360 }}
                          transition={reduce ? undefined : { duration: 3, repeat: Infinity, ease: 'linear' }}
                          className="w-6 h-6 rounded-full bg-violet-50 text-violet-600 flex items-center justify-center"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                        </motion.span>
                        <span className="text-[11px] font-semibold text-slate-500">Understanding the visit…</span>
                      </motion.div>
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key="note"
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.45 }}
                    className="absolute inset-0 p-4 space-y-2.5 overflow-y-auto bg-slate-50/50"
                  >
                    <div className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-sky-600" />
                      <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">
                        Note written by AI
                      </span>
                    </div>

                    {[
                      ['Chief complaint', 'Sore throat & fever · 2 days, mild cough.'],
                      ['Assessment', 'Acute pharyngitis, likely viral.'],
                    ].map(([h, b], i) => (
                      <motion.div
                        key={h}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.16, duration: 0.4 }}
                        className="bg-white rounded-xl border border-slate-100 p-2.5"
                      >
                        <p className="text-[9px] font-bold uppercase tracking-wide text-sky-600 mb-0.5">{h}</p>
                        <p className="text-[11.5px] text-slate-700 leading-snug">{b}</p>
                      </motion.div>
                    ))}

                    {at(B.rx) && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white rounded-xl border border-slate-100 p-2.5"
                      >
                        <p className="text-[9px] font-bold uppercase tracking-wide text-violet-600 mb-1 flex items-center gap-1">
                          <Pill className="w-3 h-3" /> Prescription
                        </p>
                        {[['Paracetamol 650mg', 'TDS · 3 days'], ['Warm saline gargle', 'Twice daily']].map(
                          ([d, s], i) => (
                            <motion.div
                              key={d}
                              initial={{ opacity: 0, x: -8 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: 0.12 + i * 0.14 }}
                              className="flex justify-between gap-2 py-1 border-b border-slate-50 last:border-0"
                            >
                              <span className="text-[11px] font-semibold text-slate-800">{d}</span>
                              <span className="text-[10px] text-slate-400">{s}</span>
                            </motion.div>
                          ),
                        )}
                        <div className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-slate-100">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                          <span className="text-[10px] font-semibold text-emerald-700">
                            No allergy or interaction conflicts
                          </span>
                        </div>
                      </motion.div>
                    )}

                    {at(B.handoff) && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ type: 'spring', stiffness: 220, damping: 18 }}
                        className="flex items-center gap-2 bg-slate-900 rounded-xl px-3 py-2"
                      >
                        <motion.span
                          animate={reduce ? undefined : { x: [0, 3, 0] }}
                          transition={reduce ? undefined : { duration: 1.4, repeat: Infinity }}
                          className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0"
                        >
                          <ArrowRight className="w-3.5 h-3.5" />
                        </motion.span>
                        <span className="text-[10.5px] font-bold text-white">
                          Signed — sending to the patient
                        </span>
                      </motion.div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>

        {/* ══ PATIENT SIDE ══ */}
        <motion.div
          animate={{ opacity: patientTurn ? 1 : 0.72 }}
          transition={{ duration: 0.6 }}
          className={`rounded-3xl border p-5 sm:p-7 flex flex-col transition-colors duration-500 ${
            patientTurn ? 'bg-white border-emerald-200 shadow-xl shadow-emerald-500/5' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <MessageSquare className="w-4 h-4" />
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-emerald-700">Patient side</span>
          </div>
          <h3 className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 mt-2">
            ClinicBook — on WhatsApp
          </h3>
          <p className="text-slate-600 text-sm mt-2 mb-5">
            The same visit lands in the chat they already use — no app, no login.
          </p>

          <div className="rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col flex-1 min-h-[400px] bg-[#e5ddd5]">
            <div className="bg-emerald-700 px-4 py-2.5 flex items-center gap-2.5 flex-shrink-0">
              <span className="w-8 h-8 rounded-full bg-white/20 text-white font-bold flex items-center justify-center text-sm">
                C
              </span>
              <div className="leading-tight">
                <div className="text-white text-sm font-semibold">City Care Clinic</div>
                <div className="text-emerald-100 text-[10px]">online</div>
              </div>
            </div>

            <div className="flex-1 p-3 space-y-2 overflow-y-auto">
              {HISTORY.map((m, i) => (
                <div
                  key={i}
                  className="max-w-[85%] px-3 py-2 rounded-2xl rounded-tl-none text-[11px] leading-relaxed shadow-xs whitespace-pre-line bg-white text-slate-800"
                >
                  {m.text}
                </div>
              ))}

              {!patientTurn && (
                <motion.p
                  animate={reduce ? undefined : { opacity: [0.4, 0.75, 0.4] }}
                  transition={reduce ? undefined : { duration: 2.4, repeat: Infinity }}
                  className="text-[10.5px] text-slate-500 text-center pt-14"
                >
                  Waiting for the consultation to finish…
                </motion.p>
              )}

              {/* The patient asks for it in their own words */}
              {at(B.ask) && (
                <motion.div
                  initial={{ opacity: 0, y: 12, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                  className="max-w-[85%] ml-auto px-3 py-2 rounded-2xl rounded-tr-none text-[11px] shadow-xs bg-[#dcf8c6] text-slate-800"
                  style={{ fontFamily: INDIC_FONT }}
                >
                  पर्चा भेज दीजिए
                </motion.div>
              )}

              {/* …and gets the real document back */}
              {at(B.pdf) && (
                <motion.div
                  initial={{ opacity: 0, y: 14, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 240, damping: 20 }}
                  className="max-w-[88%] bg-white rounded-2xl rounded-tl-none p-2.5 shadow-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-9 rounded bg-red-50 text-red-600 flex items-center justify-center text-[9px] font-bold border border-red-100 flex-shrink-0">
                      PDF
                    </span>
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-slate-800 truncate">
                        prescription-priya-patel.pdf
                      </div>
                      <div className="text-[9px] text-slate-400">1 page · signed by Dr. Mehra</div>
                    </div>
                  </div>
                  <p className="text-[10.5px] text-slate-600 mt-1.5 leading-relaxed" style={{ fontFamily: INDIC_FONT }}>
                    {SCENE.patientLine}
                  </p>
                </motion.div>
              )}

              {at(B.remind) && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 240, damping: 20 }}
                  className="max-w-[85%] bg-white rounded-2xl rounded-tl-none px-3 py-2 shadow-xs"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <Bell className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                    <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-700">
                      Reminders on
                    </span>
                  </div>
                  <p className="text-[10.5px] text-slate-700 leading-relaxed">
                    We’ll remind you at 9 AM, 3 PM and 9 PM for the next 3 days. 💙
                  </p>
                </motion.div>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      <p className="text-center text-xs text-slate-400 mt-5">
        One visit, both apps — nothing was typed twice.
      </p>
    </div>
  );
}
