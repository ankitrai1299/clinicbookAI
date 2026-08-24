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
 *            a baseline with tall caps. It needs a few percent more to look
 *            equal — less than a UI face would, because Rozha is already heavy.
 *
 *   WEIGHT   Rozha One ships ONE weight. It is not given a numeric weight at
 *            all: asking for 700 makes the browser synthesise a fake bold,
 *            which smears the thin horizontals that give the face its contrast
 *            and is exactly what makes a Devanagari logo look cheap.
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
          fontSize: '1.06em',
          // Deliberately NOT set. Rozha One has one weight and is already
          // heavy; a numeric weight here would make the browser fake a bold and
          // destroy the thin horizontals the face is built on.
          fontWeight: 400,
          letterSpacing: '-0.005em',
          // Pulls the Latin half in so the two read as one word, and lifts the
          // headline onto the Latin cap line.
          marginRight: '0.01em',
          position: 'relative',
          top: '0.055em',
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
