// The frontend has no test runner, and the one rule that decides what a visitor
// sees was wrong for a week without anything noticing: the booking-only site
// honoured a single deep link and sent every other path to the front page, so
// /whatsapp-setup opened the marketing page.
//
// Run it:  npx tsx scripts/checkRoutes.mts
import { initialPage } from '../src/route';
import type { Entry } from '../src/route';

const cases: Array<[string, Entry, boolean, string]> = [
  ['book site, /whatsapp-setup',   { page: 'whatsapp-setup', app: 'dashboard' }, true,  'whatsapp-setup'],
  ['book site, /clinicbook',       { page: 'dashboard', app: 'dashboard' },      true,  'dashboard'],
  ['book site, /',                 null,                                         true,  'landing'],
  ['book site, /novascribe',       { page: 'novascribe', app: 'novascribe' },    true,  'landing'],
  ['full site, /whatsapp-setup',   { page: 'whatsapp-setup', app: 'dashboard' }, false, 'whatsapp-setup'],
  ['full site, /',                 null,                                         false, 'home'],
];

let bad = 0;
for (const [name, entry, bookOnly, want] of cases) {
  const got = initialPage({ entry, bookOnly, appOnly: false });
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ->  ${got}${ok ? '' : `  (wanted ${want})`}`);
}
console.log(bad === 0 ? '\nall good' : `\n${bad} FAILED`);
process.exit(bad === 0 ? 0 : 1);
