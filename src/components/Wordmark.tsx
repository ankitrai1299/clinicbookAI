import { BRAND, type ProductKey } from '../brand';

interface WordmarkProps {
  /** Which product's name to set. */
  app: ProductKey;
  className?: string;
  /** Colour for the Devanagari half. Defaults to inheriting. */
  devClassName?: string;
  /** Colour for the Latin half. Defaults to inheriting. */
  latinClassName?: string;
}

/**
 * `अन्वयScribe` / `अन्वयBook.ai` — the name in two scripts, set as one word.
 *
 * Three things have to be corrected or this reads as a font failing to load
 * rather than as a wordmark. All three are the same underlying fact: Devanagari
 * and Latin are not built to the same metrics, so identical CSS produces two
 * mismatched halves.
 *
 *   SIZE     At the same font-size Devanagari looks noticeably smaller, because
 *            its glyphs hang below a headline (शिरोरेखा) instead of standing on
 *            a baseline with tall caps. It needs roughly 12% more to look equal.
 *
 *   WEIGHT   Devanagari strokes are thinner at the same numeric weight. Beside a
 *            700 Latin it needs 700–800 of its own to hold the same colour on
 *            the page, or the Sanskrit half looks faded.
 *
 *   BASELINE The headline sits where Latin has ascenders, so the two halves
 *            drift apart vertically. A small nudge settles them onto one line.
 *
 * And the font must be named explicitly. Left to inherit, the browser falls back
 * to whatever the OS ships — Nirmala UI on Windows, which is a UI font, not a
 * display face — and no amount of size or weight rescues it.
 *
 * The two halves also need to touch. Latin word-spacing leaves a gap that makes
 * this look like two words; the negative letter-spacing closes it so the eye
 * reads one.
 */
export default function Wordmark({ app, className = '', devClassName, latinClassName }: WordmarkProps) {
  const p = app === 'clinicbook' ? BRAND.book : BRAND.scribe;
  return (
    <span className={className} aria-label={p.plain} style={{ whiteSpace: 'nowrap' }}>
      <span
        aria-hidden="true"
        className={devClassName}
        style={{
          fontFamily: 'var(--font-devanagari)',
          fontSize: '1.12em',
          fontWeight: 700,
          letterSpacing: '-0.012em',
          // Pulls the Latin half in so the two read as one word, and lifts the
          // headline onto the Latin cap line.
          marginRight: '-0.015em',
          position: 'relative',
          top: '0.045em',
          display: 'inline-block',
        }}
      >
        {p.devanagari}
      </span>
      <span aria-hidden="true" className={latinClassName} style={{ letterSpacing: '-0.015em' }}>
        {p.latin}
      </span>
    </span>
  );
}
