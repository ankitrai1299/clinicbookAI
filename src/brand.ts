// The brand, in one place.
//
// Every user-visible name comes from here. Before this, "ClinicBook AI" and
// "MediScribe" were typed into a hundred places by hand, and renaming meant a
// find-and-replace across a hundred files with no way to be sure it was
// complete — or that it had not changed something it should not have.
//
// ── What is a NAME and what is an IDENTIFIER ────────────────────────────────
//
// This file holds NAMES — the words a person reads. It deliberately does NOT
// hold the identifiers that happen to look like the old names, because those
// are keys, and renaming a key breaks things that are already installed:
//
//   ?app=novascribe        deep links on doctors' phones open this
//   ?app=clinicbook        the ClinicBook APK's WebView loads this
//   com.nextdot.*          Play Store package names, which can NEVER change
//   'clinicbook' | 'mediscribe'   product entitlement keys, stored per clinic
//
// Those keep their old spelling forever. A name is for people; a key is for
// machines, and the machines have already written it down.

export const BRAND = {
  /** The platform. One word — this is the trademark. */
  name: 'Anvaya',
  /** अन्वय — Sanskrit for the joining: separate things linked into one whole. */
  devanagari: 'अन्वय',
  /** For places that need the meaning in one line. */
  meaning: 'the joining',

  /**
   * The two products.
   *
   * Written in two scripts on purpose: अन्वय in Devanagari, the rest in Latin.
   * The Sanskrit half says where this comes from, the English half says what it
   * does — and a clinic in India reads both without being taught either.
   *
   * Three forms, and the difference matters:
   *
   *   mixed  अन्वयScribe    a tab title, a heading, an email body — anywhere
   *                        Unicode renders and both halves should be seen
   *   plain  AnvayaScribe   a PDF FILENAME, an SMS, a Play Store listing —
   *                        anywhere Devanagari may be mangled or unsearchable
   *   devanagari + latin    the two halves, for the Wordmark component, which
   *                        has to nudge the baselines to make them look like
   *                        one word rather than two fonts colliding
   *
   * Nothing should build these strings by hand.
   */
  book: {
    devanagari: 'अन्वय',
    latin: 'Book.ai',
    /** The two scripts as ONE string — for a browser tab, a heading, an email. */
    mixed: 'अन्वयBook.ai',
    /** Latin only. For a filename, an SMS, or anywhere a script mix cannot go. */
    plain: 'AnvayaBook.ai',
  },
  scribe: {
    devanagari: 'अन्वय',
    latin: 'Scribe',
    mixed: 'अन्वयScribe',
    plain: 'AnvayaScribe',
  },

  /** One line under the name — what the product is, for someone new to it. */
  tagline: 'One thread through the whole visit',

  /**
   * The line under the logo, in Hindi. ONE slogan, and this is it.
   *
   * The full platform artwork has a DIFFERENT line drawn into it — हर क्लिनिक,
   * हर मरीज़ के लिए — so that cut must never be shown anywhere this text also
   * appears, or the page carries two slogans that disagree. Wherever the slogan
   * is set as text, the logo used is the one with no line baked in.
   *
   * Mukta, never Rozha. Rozha is the display face that carries अन्वय; at the
   * ~10px a sub-label gets, its thin horizontals disappear and the line turns to
   * mush. A tagline is text, not lettering.
   */
  taglineHi: 'स्वस्थ भारत, हमारा लक्ष्य',

  /**
   * The legal entity. This exact string is what goes on a footer, a policy
   * page, an invoice and the ABDM registration — those have to match, so it is
   * written once here rather than typed slightly differently in four places.
   */
  company: 'Nextdot Digital Solutions Pvt. Ltd.',
} as const;

export type ProductKey = 'clinicbook' | 'novascribe' | 'mediscribe';

/** Which product a routing key belongs to. The keys keep their old spelling. */
export const productOf = (app: ProductKey) => (app === 'clinicbook' ? BRAND.book : BRAND.scribe);

/** Latin only — safe for filenames, SMS and app-store fields. */
export const productName = (app: ProductKey): string => productOf(app).plain;

/** `अन्वयScribe — Patients`, for document.title. Titles render Unicode fine. */
export const pageTitle = (section?: string, app?: ProductKey): string => {
  const base = app ? productOf(app).mixed : BRAND.devanagari;
  return section ? `${base} — ${section}` : base;
};
