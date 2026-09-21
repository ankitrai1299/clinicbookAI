// Which page a URL opens on.
//
// Pulled out of App.tsx because it was wrong and nothing could have caught it:
// the booking-only site admitted exactly one deep link and sent every other
// path to the front page, so /whatsapp-setup — the link a clinic is most often
// SENT — opened the marketing page instead of the guide. App.tsx cannot be
// imported outside a browser, so that rule was unverifiable in practice.
//
// Nothing here touches `window`. Reading the URL stays in App.tsx; this is only
// the decision made from what was read, so it can be run and checked.
import type { PageType } from './types';

export type EntryApp = 'dashboard' | 'novascribe';
export type Entry = { page: PageType; app: EntryApp } | null;

/** Pages that exist on the booking-only site. Everything else bounces home. */
export const BOOK_SITE_PAGES: PageType[] = [
  'landing', 'dashboard', 'demo', 'developers', 'whatsapp-setup',
  'login', 'signup', 'verify-email', 'welcome',
];

export function initialPage({
  entry,
  bookOnly,
  appOnly,
}: {
  entry: Entry;
  /** The booking-only build (book.getanvaya.com), which has no scribe and no hub. */
  bookOnly: boolean;
  /** The installed phone app, which is one product and nothing else. */
  appOnly: boolean;
}): PageType {
  // A deep link is honoured whenever this site actually has that page; only a
  // page it does not have falls back to the front page.
  if (bookOnly) {
    return entry && BOOK_SITE_PAGES.includes(entry.page) ? entry.page : 'landing';
  }
  return entry?.page ?? (appOnly ? 'novascribe' : 'home');
}
