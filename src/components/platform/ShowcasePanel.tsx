import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Check, CheckCheck } from 'lucide-react';
import {
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'motion/react';

// One marketing "panel": headline + feature cards + a live WhatsApp mockup, with
// an optional photograph behind it. Built in code rather than exported as a flat
// image so it stays responsive, readable on a phone, translatable, and always in
// sync with what the product actually says.

export type PanelTone = 'green' | 'blue' | 'peach' | 'violet';

const TONES: Record<PanelTone, { bg: string; accent: string; chip: string; chipIcon: string }> = {
  green: {
    bg: 'from-emerald-50 via-white to-emerald-50/40',
    accent: 'text-emerald-600',
    chip: 'bg-white border-emerald-100',
    chipIcon: 'bg-emerald-50 text-emerald-600',
  },
  blue: {
    bg: 'from-sky-50 via-white to-sky-50/40',
    accent: 'text-sky-600',
    chip: 'bg-white border-sky-100',
    chipIcon: 'bg-sky-50 text-sky-600',
  },
  peach: {
    bg: 'from-amber-50 via-white to-orange-50/40',
    accent: 'text-amber-600',
    chip: 'bg-white border-amber-100',
    chipIcon: 'bg-amber-50 text-amber-600',
  },
  violet: {
    bg: 'from-violet-50 via-white to-violet-50/40',
    accent: 'text-violet-600',
    chip: 'bg-white border-violet-100',
    chipIcon: 'bg-violet-50 text-violet-600',
  },
};

export interface PanelFeature {
  icon: LucideIcon;
  title: string;
  desc: string;
}

/** One WhatsApp bubble. `menu` renders the numbered option list the bot sends. */
export interface ChatItem {
  from: 'in' | 'out';
  text?: string;
  time?: string;
  menu?: string[];
  slots?: { label: string; active?: boolean }[];
  card?: { title: string; rows: [string, string][]; footer?: string };
}

export interface ShowcasePanelProps {
  // Declared so panels can be rendered from a .map() (React consumes `key`;
  // TypeScript otherwise rejects it on an explicit props interface).
  key?: string | number;
  tone: PanelTone;
  eyebrow?: string;
  title: string;
  /** Rendered in the tone colour, on its own line. */
  accent: string;
  titleTail?: string;
  subtitle: string;
  features: PanelFeature[];
  clinicName: string;
  chat: ChatItem[];
  /** Optional photograph URL — the panel is designed to look complete without one. */
  photo?: string;
  photoAlt?: string;
  reverse?: boolean;
}

function Bubble({
  item,
  tone,
  index,
  float,
}: {
  item: ChatItem;
  tone: PanelTone;
  index: number;
  float: boolean;
  key?: string | number;
}) {
  const t = TONES[tone];
  const isOut = item.from === 'out';

  return (
    <motion.div
      className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}
      initial={{ opacity: 0, y: 14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
    >
      <motion.div
        // Once landed, each bubble drifts gently on its own offset so the stack
        // feels alive rather than pinned. Skipped when motion is reduced.
        animate={float ? { y: [0, -7, 0] } : undefined}
        transition={
          float
            ? { duration: 4.5, repeat: Infinity, ease: 'easeInOut', delay: index * 0.45 }
            : undefined
        }
        className={`max-w-[86%] rounded-2xl px-3.5 py-2.5 shadow-xl text-[12px] leading-snug backdrop-blur-[2px] ${
          isOut
            ? 'bg-emerald-500 text-white rounded-tr-sm'
            : 'bg-white/95 text-slate-800 rounded-tl-sm border border-white'
        }`}
      >
        {item.text && <p className="whitespace-pre-line">{item.text}</p>}

        {item.menu && (
          <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
            {item.menu.map((m, i) => (
              <div key={m} className={`text-[12px] font-semibold ${isOut ? 'text-white' : t.accent}`}>
                {i + 1}. {m}
              </div>
            ))}
          </div>
        )}

        {item.slots && (
          <div className="mt-1.5 grid grid-cols-2 gap-1">
            {item.slots.map((s) => (
              <div
                key={s.label}
                className={`text-[10px] text-center py-1 rounded border font-medium ${
                  s.active
                    ? 'bg-emerald-100 border-emerald-200 text-emerald-800'
                    : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}
              >
                {s.label}
              </div>
            ))}
          </div>
        )}

        {item.card && (
          <div className="mt-1.5 rounded border border-slate-200 bg-slate-50 p-2">
            <p className="text-[10px] font-bold text-slate-800 mb-1">{item.card.title}</p>
            {item.card.rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2 text-[10px] py-px">
                <span className="text-slate-500">{k}</span>
                <span className="font-semibold text-slate-800 text-right">{v}</span>
              </div>
            ))}
            {item.card.footer && <p className="text-[10px] text-slate-500 mt-1">{item.card.footer}</p>}
          </div>
        )}

        <div className="flex items-center justify-end gap-1 mt-1">
          <span className={`text-[9px] ${isOut ? 'text-emerald-50' : 'text-slate-400'}`}>
            {item.time ?? '10:31 AM'}
          </span>
          {isOut && <CheckCheck className="w-3 h-3 text-emerald-100" />}
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function ShowcasePanel({
  tone,
  eyebrow,
  title,
  accent,
  titleTail,
  subtitle,
  features,
  clinicName,
  chat,
  photo,
  photoAlt,
  reverse,
}: ShowcasePanelProps) {
  const t = TONES[tone];
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  // Only animate the chat while the panel is actually on screen — an off-screen
  // interval is wasted work and battery.
  const inView = useInView(ref, { amount: 0.25 });

  // Copy slides in from its own side, the visual from the opposite one.
  const copyX = reverse ? 40 : -40;
  const visualX = reverse ? -40 : 40;

  // Pointer parallax on the backdrop glow. Springs keep it soft rather than
  // tracking the cursor exactly. Desktop-only in practice (needs a pointer).
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const gx = useSpring(useTransform(px, [-0.5, 0.5], [-18, 18]), { stiffness: 60, damping: 20 });
  const gy = useSpring(useTransform(py, [-0.5, 0.5], [-12, 12]), { stiffness: 60, damping: 20 });

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width - 0.5);
    py.set((e.clientY - r.top) / r.height - 0.5);
  };

  // Chat replays one message at a time, then restarts — but only while visible.
  const [shown, setShown] = useState(chat.length);
  useEffect(() => {
    if (reduce) { setShown(chat.length); return; }
    if (!inView) return;
    setShown(0);
    const id = setInterval(
      () => setShown((c) => (c >= chat.length ? 0 : c + 1)),
      1150,
    );
    return () => clearInterval(id);
  }, [inView, chat.length, reduce]);

  return (
    <motion.div
      ref={ref}
      onPointerMove={onPointerMove}
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.8, ease: 'easeOut' }}
      whileHover={reduce ? undefined : { scale: 1.01 }}
      className={`group relative rounded-3xl border border-slate-200 bg-gradient-to-br ${t.bg} overflow-hidden transition-[box-shadow,border-color] duration-300 hover:border-emerald-200 hover:shadow-[0_18px_50px_-12px_rgba(16,185,129,0.25)]`}
    >
      {/* Soft glow that drifts with the pointer, behind everything. */}
      <motion.div
        aria-hidden="true"
        style={{ x: gx, y: gy }}
        className="pointer-events-none absolute -top-24 -right-16 w-80 h-80 rounded-full bg-emerald-200/25 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
      />

      <div
        className={`relative grid lg:grid-cols-2 gap-8 p-6 sm:p-8 lg:p-10 items-center ${
          reverse ? 'lg:[&>*:first-child]:order-2' : ''
        }`}
      >
        {/* Copy + features */}
        <motion.div
          initial={{ opacity: 0, x: copyX }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.75, ease: 'easeOut', delay: 0.1 }}
        >
          {eyebrow && (
            <span className={`text-[11px] font-bold uppercase tracking-widest ${t.accent}`}>{eyebrow}</span>
          )}
          <h3 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-tight mt-2">
            {title} <span className={t.accent}>{accent}</span>
            {titleTail ? <> {titleTail}</> : null}
          </h3>
          <p className="text-slate-600 mt-3 leading-relaxed">{subtitle}</p>

          {/* Chips arrive one after another, then lift on hover. */}
          <motion.div
            className="mt-6 space-y-2.5"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.3 }}
            variants={{ show: { transition: { staggerChildren: 0.09, delayChildren: 0.25 } } }}
          >
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <motion.div
                  key={f.title}
                  variants={{
                    hidden: { opacity: 0, y: 16 },
                    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
                  }}
                  whileHover={reduce ? undefined : { y: -6 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className={`group/chip flex items-start gap-3 rounded-xl border p-3 shadow-xs hover:shadow-lg transition-shadow duration-300 ${t.chip}`}
                >
                  <motion.span
                    whileHover={reduce ? undefined : { rotate: -8, scale: 1.08 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 14 }}
                    className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${t.chipIcon}`}
                  >
                    <Icon className="w-4.5 h-4.5" />
                  </motion.span>
                  <div className="min-w-0">
                    <div className="font-display font-bold text-slate-900 text-sm">{f.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{f.desc}</div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </motion.div>

        {/* The conversation floats OVER the photograph — one composition rather
            than a phone box sitting next to a portrait. The person is anchored
            right so the bubbles always land on clear space. */}
        <motion.div
          initial={{ opacity: 0, x: visualX, scale: 0.95 }}
          whileInView={{ opacity: 1, x: 0, scale: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.85, ease: 'easeOut', delay: 0.15 }}
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

          {/* Soft wash so white bubbles stay readable over any photo */}
          <div className="absolute inset-0 bg-gradient-to-r from-white/85 via-white/40 to-transparent" />

          <div className="relative p-4 sm:p-5">
            {/* Clinic chip — keeps the WhatsApp context without a phone frame */}
            <motion.div
              animate={reduce ? undefined : { y: [0, -6, 0] }}
              transition={reduce ? undefined : { duration: 5, repeat: Infinity, ease: 'easeInOut' }}
              className="inline-flex items-center gap-2 bg-white/95 border border-white rounded-full pl-1.5 pr-3 py-1.5 shadow-lg mb-3"
            >
              <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center">
                {clinicName.charAt(0)}
              </span>
              <span className="text-[11px] font-bold text-slate-800 flex items-center gap-1">
                {clinicName}
                <Check className="w-3 h-3 text-emerald-600" />
              </span>
            </motion.div>

            <div className="space-y-2 max-w-[85%]">
              {chat.slice(0, shown).map((item, i) => (
                <Bubble key={i} item={item} tone={tone} index={i} float={!reduce} />
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
