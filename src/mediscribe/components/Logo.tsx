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
      <AnvayaLogo height={30} cut="compact" decorative />
      <span className="leading-tight">
        <span
          className={`block text-xl tracking-tight ${light ? 'text-white' : 'text-slate-900'}`}
          style={{ fontFamily: 'var(--font-brand)', fontWeight: 500, letterSpacing: '-0.02em' }}
        >
          {BRAND.scribe.latin}
        </span>
        {/* The logo's own line, in Hindi. Mukta, not Rozha — Rozha carries
            अन्वय in the artwork but its thin horizontals disappear at 10px.
            And no uppercase or wide tracking: Devanagari has no capitals, and
            widened tracking drags a matra off its consonant. */}
        <span
          className={`block text-[10.5px] ${light ? 'text-white/60' : 'text-slate-400'}`}
          style={{ fontFamily: 'var(--font-devanagari-text)', letterSpacing: '.005em' }}
        >
          {BRAND.taglineHi}
        </span>
      </span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`flex items-center gap-2.5 cursor-pointer transition-opacity hover:opacity-80 ${className}`}
      >
        {inner}
      </button>
    );
  }

  return <div className={`flex items-center gap-2.5 ${className}`}>{inner}</div>;
}
