import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Check, CheckCheck, Phone, Video, MoreVertical, ArrowLeft, Smile, Paperclip, Mic } from 'lucide-react';

// A screen-recordable demo of the WhatsApp flow: what the patient sends, what the
// clinic sends back, and the prescription PDF at the end. Built as a page rather
// than a video file so the "footage" is the real product and can be re-recorded
// in a minute whenever the flow changes.
//
//   /demo               16:9  — website, YouTube, decks
//   /demo?format=9x16   9:16  — Reels, Status, Shorts
//   /demo?format=1x1    1:1   — feed posts
//   /demo?speed=1.5     play faster/slower
//
// Press H to hide the surrounding chrome before recording.

type Msg = {
  from: 'in' | 'out';
  text?: string;
  time: string;
  /** Typing pause shown BEFORE this message lands, in ms. */
  typing?: number;
  doc?: { name: string; meta: string };
  card?: { title: string; rows: [string, string][] };
  menu?: string[];
};

const SCRIPT: Msg[] = [
  { from: 'out', text: 'Hi, I need an appointment', time: '10:30 AM' },
  {
    from: 'in',
    typing: 1100,
    text: 'Hello! 👋 Welcome to CarePlus Clinic.\nWhat would you like to do?',
    menu: ['Book appointment', 'Reschedule', 'My prescriptions'],
    time: '10:30 AM',
  },
  { from: 'out', text: 'Book appointment', time: '10:31 AM' },
  {
    from: 'in',
    typing: 900,
    text: 'Sure! Which department?',
    menu: ['General Physician', 'Dermatology', 'Paediatrics'],
    time: '10:31 AM',
  },
  { from: 'out', text: 'General Physician', time: '10:31 AM' },
  {
    from: 'in',
    typing: 1200,
    text: 'Dr. Rohit Sharma is available tomorrow:',
    menu: ['10:00 AM', '11:00 AM', '4:30 PM'],
    time: '10:32 AM',
  },
  { from: 'out', text: '11:00 AM', time: '10:32 AM' },
  {
    from: 'in',
    typing: 1000,
    text: '✅ Your appointment is confirmed!',
    card: {
      title: 'Appointment details',
      rows: [
        ['Doctor', 'Dr. Rohit Sharma'],
        ['Date', 'Tue, 21 July'],
        ['Time', '11:00 AM'],
      ],
    },
    time: '10:32 AM',
  },
  {
    from: 'in',
    typing: 900,
    text: '⏰ Reminder: your appointment is tomorrow at 11:00 AM. See you soon!',
    time: '09:00 AM',
  },
  {
    from: 'in',
    typing: 1100,
    text: 'Here is your prescription from Dr. Rohit Sharma 💙',
    doc: { name: 'prescription_priya-patel.pdf', meta: '1 page · PDF' },
    time: '11:42 AM',
  },
  { from: 'out', text: 'Thank you! 🙏', time: '11:43 AM' },
];

const FORMATS: Record<string, { w: number; h: number; label: string }> = {
  '16x9': { w: 1280, h: 720, label: '16:9 — website / YouTube' },
  '9x16': { w: 405, h: 720, label: '9:16 — Reels / Status' },
  '1x1': { w: 720, h: 720, label: '1:1 — feed post' },
};

function Bubble({ m }: { m: Msg; key?: string | number }) {
  const out = m.from === 'out';
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={`flex ${out ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`max-w-[78%] rounded-xl px-3 py-2 shadow-sm text-[13px] leading-snug ${
          out ? 'bg-[#d9fdd3] text-slate-900 rounded-tr-sm' : 'bg-white text-slate-900 rounded-tl-sm'
        }`}
      >
        {m.text && <p className="whitespace-pre-line">{m.text}</p>}

        {m.menu && (
          <div className="mt-2 pt-2 border-t border-slate-200/70 space-y-1.5">
            {m.menu.map((x, i) => (
              <div key={x} className="text-[13px] font-semibold text-[#027eb5]">
                {i + 1}. {x}
              </div>
            ))}
          </div>
        )}

        {m.card && (
          <div className="mt-2 rounded-lg bg-slate-50 border border-slate-200 p-2.5">
            <p className="text-[11px] font-bold text-slate-800 mb-1">{m.card.title}</p>
            {m.card.rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 text-[11px] py-0.5">
                <span className="text-slate-500">{k}</span>
                <span className="font-semibold text-slate-800">{v}</span>
              </div>
            ))}
          </div>
        )}

        {m.doc && (
          <div className="mt-2 flex items-center gap-2.5 rounded-lg bg-slate-50 border border-slate-200 p-2">
            <span className="w-9 h-10 rounded bg-red-50 border border-red-100 text-red-600 text-[9px] font-bold flex items-center justify-center">
              PDF
            </span>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-slate-800 truncate">{m.doc.name}</div>
              <div className="text-[10px] text-slate-400">{m.doc.meta}</div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-1 mt-0.5">
          <span className="text-[9px] text-slate-400">{m.time}</span>
          {out && <CheckCheck className="w-3 h-3 text-[#53bdeb]" />}
        </div>
      </div>
    </motion.div>
  );
}

export default function WhatsAppDemo() {
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const format = FORMATS[params.get('format') ?? '16x9'] ?? FORMATS['16x9'];
  const speed = Math.max(0.4, Math.min(3, Number(params.get('speed')) || 1));
  const reduce = useReducedMotion();

  const [shown, setShown] = useState(0);
  const [typing, setTyping] = useState(false);
  const [chrome, setChrome] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Hide the page chrome with H so the capture is just the phone.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'h') setChrome((c) => !c);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Play the script: typing indicator, then the message, then on to the next.
  useEffect(() => {
    if (reduce) { setShown(SCRIPT.length); return; }
    let cancelled = false;
    const timers: number[] = [];
    const wait = (ms: number) => new Promise<void>((r) => timers.push(window.setTimeout(r, ms / speed)));

    (async () => {
      while (!cancelled) {
        setShown(0);
        setTyping(false);
        await wait(900);
        for (let i = 0; i < SCRIPT.length && !cancelled; i++) {
          const m = SCRIPT[i];
          if (m.typing) {
            setTyping(true);
            await wait(m.typing);
            setTyping(false);
          }
          setShown(i + 1);
          await wait(m.from === 'out' ? 900 : 1500);
        }
        await wait(2600); // hold the finished conversation, then loop
      }
    })();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [speed, reduce]);

  // Keep the newest message in view.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [shown, typing]);

  const visible = useMemo(() => SCRIPT.slice(0, shown), [shown]);
  const isTall = format.h > format.w;

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-emerald-50 via-white to-sky-50 flex flex-col items-center justify-center p-6">
      {chrome && (
        <div className="text-center mb-5">
          <p className="text-sm font-bold text-slate-700">Screen-record this area →  {format.label}</p>
          <p className="text-xs text-slate-400 mt-1">
            Press <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px]">H</kbd> to hide this text ·
            add <code className="text-[10px]">?format=9x16</code> for Reels · <code className="text-[10px]">?speed=1.5</code> to speed up
          </p>
        </div>
      )}

      {/* The capture frame — exact pixel size so the recording is clean. */}
      <div
        style={{ width: format.w, height: format.h }}
        className="relative max-w-full rounded-2xl overflow-hidden shadow-2xl bg-gradient-to-br from-emerald-100 via-white to-sky-100 flex items-center justify-center"
      >
        {/* soft blooms */}
        <div className="absolute -top-16 -left-10 w-72 h-72 rounded-full bg-emerald-200/40 blur-3xl" />
        <div className="absolute -bottom-16 -right-10 w-72 h-72 rounded-full bg-sky-200/40 blur-3xl" />

        <div className={`relative flex items-center gap-10 ${isTall ? 'flex-col gap-5' : ''}`}>
          {/* Caption rail (hidden on the tall format to keep the phone big) */}
          {!isTall && (
            <div className="w-[300px]">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700 mb-3">
                ClinicBook AI
              </div>
              <h2 className="font-display text-3xl font-extrabold text-slate-900 leading-tight">
                Appointments on WhatsApp.
              </h2>
              <p className="text-slate-600 mt-3 leading-relaxed">
                Patients book, get reminders and receive their prescription — all in the chat they already
                use. No app, no forms, no calls.
              </p>
            </div>
          )}

          {/* Phone */}
          <div className="rounded-[32px] bg-slate-900 p-2 shadow-2xl border-4 border-slate-800">
            <div className="w-[280px] h-[560px] rounded-[24px] overflow-hidden flex flex-col bg-[#efe7de]">
              {/* Header */}
              <div className="bg-[#075e54] px-3 py-2.5 flex items-center gap-2 flex-shrink-0">
                <ArrowLeft className="w-4 h-4 text-white/80" />
                <span className="w-8 h-8 rounded-full bg-white/20 text-white text-[11px] font-bold flex items-center justify-center">
                  C
                </span>
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="text-white text-[12px] font-semibold flex items-center gap-1 truncate">
                    CarePlus Clinic <Check className="w-3 h-3 text-emerald-300" />
                  </div>
                  <div className="text-emerald-100 text-[9px]">{typing ? 'typing…' : 'online'}</div>
                </div>
                <Video className="w-4 h-4 text-white/80" />
                <Phone className="w-4 h-4 text-white/80" />
                <MoreVertical className="w-4 h-4 text-white/80" />
              </div>

              {/* Messages */}
              <div ref={scrollRef} className="flex-1 overflow-hidden p-2.5 space-y-1.5">
                <AnimatePresence initial={false}>
                  {visible.map((m, i) => (
                    <Bubble key={i} m={m} />
                  ))}
                </AnimatePresence>

                {typing && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                    <div className="bg-white rounded-xl rounded-tl-sm px-3 py-2.5 shadow-sm flex gap-1">
                      {[0, 1, 2].map((d) => (
                        <motion.span
                          key={d}
                          animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
                          transition={{ duration: 1, repeat: Infinity, delay: d * 0.15 }}
                          className="w-1.5 h-1.5 rounded-full bg-slate-400"
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Composer */}
              <div className="bg-[#f0f0f0] px-2 py-2 flex items-center gap-1.5 flex-shrink-0">
                <div className="flex-1 bg-white rounded-full px-3 py-2 flex items-center gap-2">
                  <Smile className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-[10px] text-slate-400">Message</span>
                  <Paperclip className="w-3.5 h-3.5 text-slate-400 ml-auto" />
                </div>
                <span className="w-8 h-8 rounded-full bg-[#25d366] flex items-center justify-center">
                  <Mic className="w-4 h-4 text-white" />
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {chrome && (
        <div className="flex flex-wrap justify-center gap-2 mt-5">
          {Object.entries(FORMATS).map(([k, f]) => (
            <a
              key={k}
              href={`?format=${k}`}
              className={`text-xs font-bold rounded-full px-4 py-2 border transition-colors ${
                f === format
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              {f.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
