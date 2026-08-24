import { BRAND } from '../brand';

/**
 * The Anvaya logo — the real artwork, not a redrawing of it.
 *
 * Three cuts of one file, because one image cannot do every job:
 *
 *   full     अन्वय + the stethoscope swoosh + हर क्लिनिक, हर मरीज़ के लिए
 *            For a hero, a login card, a footer — anywhere with room to read it.
 *
 *   compact  the same, minus the tagline. At the 36–40px a header gives a logo,
 *            the tagline is about four pixels tall: unreadable, and it steals
 *            the height that would have made the name legible. Dropping it is
 *            what lets the wordmark actually be seen.
 *
 *   icon     अन्वय knocked out in white on the brand gradient, square.
 *            The logo has no standalone symbol to crop — the stethoscope
 *            overlaps the letters both across and down, so every vertical cut
 *            slices a glyph and every horizontal one halves the stethoscope.
 *            The name is the mark.
 *
 * Served from /brand rather than imported, so the same files are reachable by
 * the app, an email, an app store listing and anyone who asks for the logo.
 */

type Cut = 'full' | 'compact' | 'icon';

const SRC: Record<Cut, string> = {
  full: '/brand/anvaya-logo.png',
  compact: '/brand/anvaya-logo-compact.png',
  icon: '/brand/anvaya-icon.png',
};

// Intrinsic ratios, so width can be reserved before the image loads and the
// page does not jump when it does.
const RATIO: Record<Cut, number> = {
  full: 1556 / 841,
  compact: 1516 / 682,
  icon: 1,
};

interface AnvayaLogoProps {
  /** Rendered height in px. Width follows the artwork. */
  height?: number;
  cut?: Cut;
  className?: string;
  /** Decorative beside a product name; labelled when it stands alone. */
  decorative?: boolean;
}

export default function AnvayaLogo({
  height = 40,
  cut = 'compact',
  className = '',
  decorative = false,
}: AnvayaLogoProps) {
  return (
    <img
      src={SRC[cut]}
      alt={decorative ? '' : BRAND.name}
      aria-hidden={decorative || undefined}
      width={Math.round(height * RATIO[cut])}
      height={height}
      style={{ height, width: 'auto', display: 'block' }}
      className={className}
      // The logo is above the fold everywhere it appears, so it is never
      // lazy-loaded — a brand that fades in late reads as a slow site.
      loading="eager"
      decoding="async"
    />
  );
}
