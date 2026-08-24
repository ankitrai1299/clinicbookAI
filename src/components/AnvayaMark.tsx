import { useId } from 'react';

// The Anvaya mark: two open rings, interlocked, carrying one gradient.
//
// अन्वय means the joining — separate things linked into one connected whole —
// so the mark is two things holding on to each other. The rings are OPEN rather
// than closed because the chain keeps extending: to the patient, to the doctor,
// and now out to ABDM.
//
// The colour does the same work as the shape. ONE gradient runs across BOTH
// rings, blue on the left through teal in the middle to green on the right, so
// the left ring is blue, the right is green, and they meet in the teal where
// they interlock. Two separate fills would have been two things placed side by
// side; one gradient is two things becoming one, which is the whole point.
//
// Blue → teal → green is the palette from the reference designs: clinical blue
// resolving into the green of health.
//
// Drawn as geometry rather than exported from a design tool, so it stays sharp
// from a 16px favicon to a printed board and weighs nothing.

const BLUE = '#0F3D77';
const TEAL = '#0E8C8C';
const GREEN = '#3EAE49';

interface AnvayaMarkProps {
  /** Rendered height in px. Drawn on a 120×80 grid and scales cleanly. */
  size?: number;
  /**
   * `gradient` — blue→teal→green, the primary mark
   * `mono`     — one colour, taking `currentColor`: a dense header, a favicon,
   *              a fax, anywhere the gradient would turn to mud
   * `onDark`   — white through the green, for a dark or coloured ground
   */
  variant?: 'gradient' | 'mono' | 'onDark';
  className?: string;
  /** Decorative beside the wordmark; give it a label when it stands alone. */
  title?: string;
}

export default function AnvayaMark({
  size = 32,
  variant = 'gradient',
  className,
  title,
}: AnvayaMarkProps) {
  // A gradient is referenced by id, and ids are global to the document. Two
  // marks on one page — the header and the footer — would otherwise share one
  // definition, and whichever rendered last would silently restyle the other.
  const gid = useId().replace(/:/g, '');

  const stroke = {
    fill: 'none',
    strokeWidth: 9,
    strokeLinecap: 'round' as const,
    stroke: variant === 'mono' ? 'currentColor' : `url(#${gid})`,
  };

  return (
    <svg
      viewBox="0 0 120 80"
      width={size * (120 / 80)}
      height={size}
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        {/* Horizontal, so the colour changes ACROSS the join rather than down
            through it — the left ring reads blue, the right green. */}
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
          {variant === 'onDark' ? (
            <>
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="55%" stopColor="#A8E6C9" />
              <stop offset="100%" stopColor="#6FD08C" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor={BLUE} />
              <stop offset="52%" stopColor={TEAL} />
              <stop offset="100%" stopColor={GREEN} />
            </>
          )}
        </linearGradient>
      </defs>

      {/* Ring A opens to the right, ring B to the left, and they overlap in the
          middle. The third path is a sliver of A redrawn ON TOP of B at the
          upper crossing — without it the two merely overlap, and overlapping is
          not the same picture as interlocking. */}
      <path d="M 57.77 20.34 A 24 24 0 1 0 57.77 59.66" {...stroke} />
      <path d="M 62.23 59.66 A 24 24 0 1 1 62.23 20.34" {...stroke} />
      <path d="M 62.91 25.22 A 24 24 0 0 0 56.72 19.65" {...stroke} />
    </svg>
  );
}

/**
 * The mark on its own tile — an app icon, or the lockup in a site header.
 *
 * The gradient moves to the TILE and the mark is knocked out in white, because
 * a gradient mark on a gradient ground disappears. At icon sizes a shape needs
 * a hard edge against its background far more than it needs colour.
 */
export function AnvayaTile({ size = 40, className = '' }: { size?: number; className?: string }) {
  const gid = useId().replace(/:/g, '');
  return (
    <span
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        background: `linear-gradient(135deg, ${BLUE} 0%, ${TEAL} 55%, ${GREEN} 100%)`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 'none',
      }}
      aria-hidden="true"
      data-gid={gid}
    >
      <AnvayaMark size={size * 0.46} variant="mono" className="text-white" />
    </span>
  );
}
