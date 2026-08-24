import { BRAND, type ProductKey } from '../brand';

interface WordmarkProps {
  /** Which product's name to set. */
  app: ProductKey;
  className?: string;
  /** Tailwind text colour class for the Devanagari half. Defaults to the accent. */
  devClassName?: string;
}

/**
 * `अन्वयBook.ai` / `अन्वयScribe` — the name in two scripts.
 *
 * Devanagari and Latin do not share a baseline or an x-height, so setting them
 * in one span leaves the Sanskrit sitting low and looking like a rendering bug.
 * They are two spans with the Devanagari nudged, which is the only way this
 * reads as one word rather than two fonts colliding.
 *
 * The whole string also has to survive being read aloud and typed into a
 * browser, which Devanagari cannot do — so anywhere that matters (titles,
 * emails, PDFs, app stores) uses `BRAND.book.plain` / `BRAND.scribe.plain`
 * instead of this component. Never hand-concatenate the two halves.
 */
export default function Wordmark({ app, className = '', devClassName }: WordmarkProps) {
  const p = app === 'clinicbook' ? BRAND.book : BRAND.scribe;
  return (
    <span className={className} aria-label={p.plain}>
      <span
        aria-hidden="true"
        className={devClassName}
        // Devanagari renders with a taller ascender and a lower baseline than
        // Latin at the same size; without the nudge the two halves look like a
        // mistake rather than a wordmark.
        style={{ fontWeight: 500, marginRight: '0.04em', position: 'relative', top: '0.02em' }}
      >
        {p.devanagari}
      </span>
      <span aria-hidden="true">{p.latin}</span>
    </span>
  );
}
