// The brand, in one place.
//
// Every user-visible name comes from here. Before this, "ClinicBook AI" and
// "MediScribe" were typed into a hundred places by hand, and renaming meant a
// find-and-replace across a hundred files with no way to be sure it was
// complete or that it had not changed something it should not have.
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

  /** The clinic's side: appointments, WhatsApp, patients, front desk. */
  desk: 'Anvaya Desk',
  /** The doctor's side: recording, notes, prescriptions. */
  scribe: 'Anvaya Scribe',

  /** Short forms, for a phone header where the full name will not fit. */
  deskShort: 'Desk',
  scribeShort: 'Scribe',

  /** One line under the name — what the product is, for someone who has never seen it. */
  tagline: 'One thread through the whole visit',

  /** The legal entity, for footers and policy pages. */
  company: 'NextDot',
} as const;

/** The full name of a product, given the routing key. Never build these by hand. */
export const productName = (app: 'clinicbook' | 'novascribe' | 'mediscribe'): string =>
  app === 'clinicbook' ? BRAND.desk : BRAND.scribe;

/** `Anvaya Desk — Patients`, for document.title. */
export const pageTitle = (section?: string, app?: 'clinicbook' | 'novascribe' | 'mediscribe'): string => {
  const base = app ? productName(app) : BRAND.name;
  return section ? `${base} — ${section}` : base;
};
