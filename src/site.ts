// Which site this build is.
//
// Anvaya sells two products and the platform site says so. अन्वयBook is ready to
// sell and अन्वयScribe is not, so the booking product gets a site of its own:
// same code, same backend, built with VITE_SITE=book and deployed as its own
// Vercel project on its own domain.
//
// A separate BUILD, not a separate codebase. A fork would have to be kept in
// step by hand forever, and the half nobody is looking at is the half that
// rots. Every fix to booking reaches both sites by being written once.
//
// On this site Scribe is not hidden, it is ABSENT — no link, no landing page,
// no mention in the navigation. A product a clinic cannot buy yet should not be
// dangled in front of them.
//
// ABDM is absent for a harder reason. The ABHA screens are wired to the ABDM
// SANDBOX, so a clinic pressing that button would be told an ABHA had been
// created when none was. Certification has not come through, and until it does
// the honest thing is for the feature not to be there at all.
//
// Its own module rather than a constant in App, because Navigation needs it and
// App imports Navigation — a constant there would make the two files import
// each other.
// Written as a bare comparison on purpose. Vite substitutes the literal at
// build time, so this becomes `'book' === 'book'` — a constant Rollup can fold,
// which lets it DELETE the Scribe and ABDM branches from the booking bundle
// rather than merely skip them at runtime. Adding .trim().toLowerCase() here
// would defeat that: the value stops being a constant, every branch survives,
// and a product that is supposed to be absent is only hidden.
export const SITE_BOOK_ONLY = import.meta.env.VITE_SITE === 'book';
