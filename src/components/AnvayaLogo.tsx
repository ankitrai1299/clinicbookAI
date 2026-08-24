import { BRAND, type ProductKey } from '../brand';

/**
 * The Anvaya logos — the real artwork, at the cut each place needs.
 *
 * There are now three lockups, not one. The two product logos already contain
 * their own name (अन्वय Book, अन्वय Scribe), so wherever one of them appears the
 * product must NOT be named again beside it — the logo has said it.
 *
 *   book / scribe   the product lockups. Headers, login, product cards.
 *   platform        अन्वय alone, plus हर क्लिनिक, हर मरीज़ के लिए. For the hub
 *                   and anywhere that is about the company rather than a product.
 *   icon            अन्वय in white on the brand gradient, square. Favicons and
 *                   app icons, where a wide lockup is unreadable.
 *
 * `light` swaps to a reversed cut for dark grounds. The lettering is navy, which
 * on the scribe's dark sidebar is nearly invisible — present, and unreadable.
 * Only the navy is lifted to white in that cut; the green stethoscope and blue
 * swoosh already carry on dark, and flattening everything to white would throw
 * away the one thing that makes this mark this brand.
 *
 * Served from /brand rather than imported, so the same files are reachable by
 * the app, an email, an app-store listing, and anyone who asks for the logo.
 */

type Cut = 'book' | 'scribe' | 'platform' | 'platform-compact' | 'icon';

const SRC: Record<Cut, { light: string; dark: string; ratio: number }> = {
  book: {
    light: '/brand/anvaya-book.png',
    dark: '/brand/anvaya-book-light.png',
    ratio: 1619 / 556,
  },
  scribe: {
    light: '/brand/anvaya-scribe.png',
    dark: '/brand/anvaya-scribe-light.png',
    ratio: 1707 / 559,
  },
  // The platform mark carries the tagline inside the artwork; the compact cut
  // drops it, because at a header's 36–40px it is four pixels tall and steals
  // the height that would have made the NAME legible.
  platform: { light: '/brand/anvaya-logo.png', dark: '/brand/anvaya-logo.png', ratio: 1556 / 841 },
  'platform-compact': {
    light: '/brand/anvaya-logo-compact.png',
    dark: '/brand/anvaya-logo-compact.png',
    ratio: 1516 / 682,
  },
  icon: { light: '/brand/anvaya-icon.png', dark: '/brand/anvaya-icon.png', ratio: 1 },
};

/** The lockup for a routing key. The keys keep their old spelling; the art does not. */
export const cutFor = (app: ProductKey): Cut => (app === 'clinicbook' ? 'book' : 'scribe');

interface AnvayaLogoProps {
  /** Rendered height in px. Width follows the artwork. */
  height?: number;
  cut?: Cut;
  /** Use the reversed artwork, for a dark ground. */
  light?: boolean;
  className?: string;
  /** Decorative beside other text; labelled when it stands alone. */
  decorative?: boolean;
}

export default function AnvayaLogo({
  height = 40,
  cut = 'platform-compact',
  light = false,
  className = '',
  decorative = false,
}: AnvayaLogoProps) {
  const art = SRC[cut];
  const label = cut === 'book' ? BRAND.book.plain : cut === 'scribe' ? BRAND.scribe.plain : BRAND.name;

  return (
    <img
      src={light ? art.dark : art.light}
      alt={decorative ? '' : label}
      aria-hidden={decorative || undefined}
      // Width is reserved from the artwork's own ratio so the page does not
      // jump when the image arrives.
      width={Math.round(height * art.ratio)}
      height={height}
      style={{ height, width: 'auto', display: 'block' }}
      className={className}
      // Above the fold everywhere it appears — a brand that fades in late reads
      // as a slow site.
      loading="eager"
      decoding="async"
    />
  );
}
