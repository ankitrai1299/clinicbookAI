import { BRAND } from '../../brand';
import AnvayaLogo from '../../components/AnvayaLogo';

interface LogoProps {
  /** When provided, the logo renders as a clickable button (e.g. back to dashboard). */
  onClick?: () => void;
  /** Extra classes for the outer element (e.g. responsive visibility). */
  className?: string;
  /** Use the white wordmark on dark surfaces (e.g. the sidebar). */
  light?: boolean;
}

/**
 * The brand mark inside the scribe. Every header uses this one component, so
 * the mark, wordmark, size, weight, spacing and colour stay identical
 * everywhere — a logo that drifts between screens reads as two products.
 *
 * The wordmark is `Anvaya Scribe`, and both halves of that come from
 * src/brand.ts. This is the doctor's side of one platform, not a separate
 * product with its own name.
 */
export default function Logo({ onClick, className = '', light = false }: LogoProps) {
  const inner = (
    <>
      {/* The lockup already reads अन्वय Scribe, so the only thing under it is
          the Hindi line — a subtitle, below the title, not beside it.
          `light` swaps to the reversed artwork: the lettering is navy, and on
          this dark sidebar navy is present but unreadable. */}
      <AnvayaLogo height={32} cut="scribe" light={light} decorative />
      <span
        className={`block text-[10.5px] leading-none pl-0.5 ${light ? 'text-white/60' : 'text-slate-400'}`}
        style={{ fontFamily: 'var(--font-devanagari-text)', letterSpacing: '.005em' }}
      >
        {BRAND.taglineHi}
      </span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`flex flex-col items-start gap-0.5 cursor-pointer transition-opacity hover:opacity-80 ${className}`}
      >
        {inner}
      </button>
    );
  }

  return <div className={`flex flex-col items-start gap-0.5 ${className}`}>{inner}</div>;
}
