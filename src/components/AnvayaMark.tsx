// The Anvaya mark: two open rings, interlocked.
//
// अन्वय means the joining — separate things linked into one connected whole —
// so the mark is literally two things holding on to each other. The rings are
// OPEN rather than closed because the chain keeps extending: to the patient, to
// the doctor, and now out to ABDM.
//
// Drawn as geometry, not exported from a design tool, so it stays sharp from a
// 16px favicon to a printed board and weighs nothing.

interface AnvayaMarkProps {
  /** Rendered size in px. The mark is drawn on a 120×80 grid and scales cleanly. */
  size?: number;
  /**
   * `duo`  — indigo + marigold, the primary lockup
   * `mono` — one colour, taking `currentColor`: for a dense header, a favicon,
   *          a fax, or anywhere the two-colour version would turn to mud
   * `onDark` — white + marigold, for the indigo ground
   */
  variant?: 'duo' | 'mono' | 'onDark';
  className?: string;
  /** Decorative next to the wordmark; give it a label when it stands alone. */
  title?: string;
}

const INDIGO = '#1F2A6B';
const MARIGOLD = '#E0A03C';

export default function AnvayaMark({
  size = 32,
  variant = 'duo',
  className,
  title,
}: AnvayaMarkProps) {
  const a = variant === 'duo' ? INDIGO : variant === 'onDark' ? '#FFFFFF' : 'currentColor';
  const b = variant === 'mono' ? 'currentColor' : MARIGOLD;

  // Ring A opens to the right, ring B to the left, and they overlap in the
  // middle. The third path is a sliver of A redrawn ON TOP of B at the upper
  // crossing — without it the two merely overlap, and overlapping is not the
  // same picture as interlocking.
  const stroke = { fill: 'none', strokeWidth: 9, strokeLinecap: 'round' as const };

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
      <path d="M 57.77 20.34 A 24 24 0 1 0 57.77 59.66" stroke={a} {...stroke} />
      <path d="M 62.23 59.66 A 24 24 0 1 1 62.23 20.34" stroke={b} {...stroke} />
      <path d="M 62.91 25.22 A 24 24 0 0 0 56.72 19.65" stroke={a} {...stroke} />
    </svg>
  );
}
