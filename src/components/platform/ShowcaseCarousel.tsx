import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'motion/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import ShowcasePanel, { type ShowcasePanelProps } from './ShowcasePanel';

// One rotating showcase instead of a stack of static cards: each use case plays
// for a few seconds, fades out, and the next fades in — so the page stays short
// while every scenario still gets shown.
//
// Autoplay is deliberately polite: it only runs while the carousel is on screen,
// pauses while the pointer is over it (so a reader is never yanked to the next
// slide), and doesn't run at all under prefers-reduced-motion.

interface Props {
  panels: ShowcasePanelProps[];
  /** How long each session holds before advancing. */
  intervalMs?: number;
}

export default function ShowcaseCarousel({ panels, intervalMs = 5500 }: Props) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [paused, setPaused] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.35 });
  const reduce = useReducedMotion();

  const go = useCallback(
    (dir: number) => {
      setDirection(dir);
      setIndex((i) => (i + dir + panels.length) % panels.length);
    },
    [panels.length],
  );

  const jumpTo = (i: number) => {
    if (i === index) return;
    setDirection(i > index ? 1 : -1);
    setIndex(i);
  };

  // Advance on a timer that restarts whenever the slide changes, so manual
  // navigation always gets a full dwell before autoplay takes over again.
  useEffect(() => {
    if (!inView || paused || reduce || panels.length < 2) return;
    const id = setTimeout(() => go(1), intervalMs);
    return () => clearTimeout(id);
  }, [index, inView, paused, reduce, intervalMs, go, panels.length]);

  const panel = panels[index];

  return (
    <div ref={ref} className="relative">
      {/* Session tabs — double as the slide indicator. */}
      <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
        {panels.map((p, i) => {
          const active = i === index;
          return (
            <button
              key={p.title}
              onClick={() => jumpTo(i)}
              aria-label={`Show ${p.eyebrow ?? p.title}`}
              aria-current={active}
              className={`relative overflow-hidden rounded-full text-xs font-bold tracking-wide transition-colors duration-300 ${
                active
                  ? 'bg-slate-900 text-white px-4 py-2'
                  : 'bg-white text-slate-500 border border-slate-200 hover:text-slate-800 hover:border-slate-300 px-4 py-2'
              }`}
            >
              <span className="relative z-10">{p.eyebrow ?? `Step ${i + 1}`}</span>
              {/* Dwell progress on the active tab. */}
              {active && !reduce && !paused && inView && panels.length > 1 && (
                <motion.span
                  key={index}
                  className="absolute inset-y-0 left-0 bg-white/20"
                  initial={{ width: '0%' }}
                  animate={{ width: '100%' }}
                  transition={{ duration: intervalMs / 1000, ease: 'linear' }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Stage. A min-height on desktop keeps the frame steady while slides of
          slightly different length swap in and out. */}
      <div
        className="relative lg:min-h-[560px]"
        onPointerEnter={() => setPaused(true)}
        onPointerLeave={() => setPaused(false)}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={index}
            initial={{ opacity: 0, x: reduce ? 0 : direction * 48 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: reduce ? 0 : direction * -48 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* chatLoop off: inside a carousel the conversation should play once
                and settle, since the slide itself is what repeats. */}
            <ShowcasePanel {...panel} chatLoop={false} chatSpeedMs={780} />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Manual controls */}
      {panels.length > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <button
            onClick={() => go(-1)}
            aria-label="Previous"
            className="w-10 h-10 rounded-full bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300 shadow-sm flex items-center justify-center transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-1.5">
            {panels.map((p, i) => (
              <button
                key={p.title}
                onClick={() => jumpTo(i)}
                aria-label={`Go to slide ${i + 1}`}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === index ? 'w-6 bg-slate-900' : 'w-2 bg-slate-300 hover:bg-slate-400'
                }`}
              />
            ))}
          </div>

          <button
            onClick={() => go(1)}
            aria-label="Next"
            className="w-10 h-10 rounded-full bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300 shadow-sm flex items-center justify-center transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}
