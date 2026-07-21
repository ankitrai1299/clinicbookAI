import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useInView, useReducedMotion, useSpring, useMotionValue, useTransform } from 'motion/react';

// Shared building blocks for the NovaScribe landing: one place for the palette,
// the reveal behaviour and the small interactions, so thirteen sections stay
// visually of a piece instead of each inventing its own.

/** Section reveal — fade + rise, once, respects reduced motion. */
export function Reveal({
  children,
  delay = 0,
  y = 28,
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  // Declared so Reveal can be used inside a .map() (React consumes `key`).
  key?: string | number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: reduce ? 0 : y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** Stagger container — children reveal one after another. */
export function Stagger({
  children,
  className = '',
  gap = 0.08,
  delay = 0.1,
}: {
  children: ReactNode;
  className?: string;
  gap?: number;
  delay?: number;
}) {
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.2 }}
      variants={{ show: { transition: { staggerChildren: gap, delayChildren: delay } } }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export const staggerItem = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
};

/** Card that tilts slightly toward the pointer, with a soft glow on hover. */
export function TiltCard({
  children,
  className = '',
  glow = 'rgba(16,185,129,0.18)',
}: {
  children: ReactNode;
  className?: string;
  glow?: string;
}) {
  const reduce = useReducedMotion();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [6, -6]), { stiffness: 150, damping: 18 });
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-6, 6]), { stiffness: 150, damping: 18 });

  return (
    <motion.div
      onPointerMove={(e) => {
        if (reduce) return;
        const r = e.currentTarget.getBoundingClientRect();
        mx.set((e.clientX - r.left) / r.width - 0.5);
        my.set((e.clientY - r.top) / r.height - 0.5);
      }}
      onPointerLeave={() => { mx.set(0); my.set(0); }}
      style={reduce ? undefined : { rotateX: rx, rotateY: ry, transformPerspective: 900 }}
      whileHover={reduce ? undefined : { y: -6 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={`relative rounded-2xl transition-shadow duration-300 ${className}`}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = `0 24px 60px -18px ${glow}`; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = ''; }}
    >
      {children}
    </motion.div>
  );
}

/** Number that counts up when it scrolls into view. */
export function Counter({
  to,
  suffix = '',
  prefix = '',
  duration = 1.4,
}: {
  to: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reduce) { setN(to); return; }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / (duration * 1000));
      // easeOutExpo so it decelerates like a real readout
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      setN(Math.round(to * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, duration, reduce]);

  return (
    <span ref={ref} className="tabular-nums">
      {prefix}
      {n}
      {suffix}
    </span>
  );
}

/** Typewriter that runs once in view. */
export function Typewriter({ text, speed = 28, className = '' }: { text: string; speed?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const reduce = useReducedMotion();
  const [out, setOut] = useState('');

  useEffect(() => {
    if (!inView) return;
    if (reduce) { setOut(text); return; }
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setOut(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [inView, text, speed, reduce]);

  return (
    <span ref={ref} className={className}>
      {out}
      {out.length < text.length && <span className="inline-block w-[2px] h-[1em] align-middle bg-current animate-pulse ml-0.5" />}
    </span>
  );
}

/** Animated voice waveform. */
export function Waveform({ bars = 28, active = true, className = '' }: { bars?: number; active?: boolean; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <div className={`flex items-end gap-[3px] ${className}`}>
      {Array.from({ length: bars }).map((_, i) => (
        <motion.span
          key={i}
          className="w-[3px] rounded-full bg-current"
          animate={reduce || !active ? { height: 6 } : { height: [5, 8 + ((i * 7) % 20), 5] }}
          transition={reduce || !active ? undefined : { duration: 0.9, repeat: Infinity, delay: i * 0.045, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

/** The page's ambient backdrop: soft mint/blue/violet blooms that drift. */
export function AmbientBackdrop({ className = '' }: { className?: string }) {
  const reduce = useReducedMotion();
  const blob = (delay: number) =>
    reduce ? undefined : { x: [0, 18, 0], y: [0, -14, 0], transition: { duration: 18, repeat: Infinity, ease: 'easeInOut', delay } };

  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <motion.div animate={blob(0)} className="absolute -top-24 -left-16 w-[32rem] h-[32rem] rounded-full bg-emerald-200/30 blur-3xl" />
      <motion.div animate={blob(3)} className="absolute top-1/3 -right-24 w-[30rem] h-[30rem] rounded-full bg-sky-200/30 blur-3xl" />
      <motion.div animate={blob(6)} className="absolute -bottom-32 left-1/3 w-[28rem] h-[28rem] rounded-full bg-violet-200/25 blur-3xl" />
    </div>
  );
}

/** Section heading with an eyebrow, used by every section for rhythm. */
export function SectionHead({
  eyebrow,
  title,
  accent,
  sub,
  center = true,
}: {
  eyebrow?: string;
  title: string;
  accent?: string;
  sub?: string;
  center?: boolean;
}) {
  return (
    <Reveal className={`${center ? 'text-center mx-auto' : ''} max-w-2xl`}>
      {eyebrow && (
        <span className="inline-block text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-3 py-1 mb-5">
          {eyebrow}
        </span>
      )}
      <h2 className="font-display text-3xl sm:text-4xl lg:text-[2.75rem] font-extrabold text-slate-900 tracking-tight leading-[1.1]">
        {title}{' '}
        {accent && (
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 via-sky-600 to-violet-600">
            {accent}
          </span>
        )}
      </h2>
      {sub && <p className="text-lg text-slate-600 mt-4 leading-relaxed">{sub}</p>}
    </Reveal>
  );
}
