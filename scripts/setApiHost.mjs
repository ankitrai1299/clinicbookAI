// Point everything at a new backend origin, in one command.
//
//   node scripts/setApiHost.mjs                       # show what would change
//   node scripts/setApiHost.mjs https://api.getanvaya.com --write
//
// ── Why this exists ───────────────────────────────────────────────────────
//
// The backend's address is written into the two phone apps at BUILD time. Expo
// inlines EXPO_PUBLIC_* when the APK is built, so the URL is baked into every
// installed copy: changing hosts means a rebuild and a redistribution, for
// every doctor who already has the app.
//
// That is the whole argument for a custom domain. With api.getanvaya.com in the
// APK, moving off Railway is one DNS record and nobody reinstalls anything.
// Until then the Railway hostname is load-bearing in files nobody thinks to
// look at — five build profiles across two eas.json files, a fallback constant,
// a webhook default, and the deployment notes.
//
// So this walks all of them at once. Missing one is how an app ships pointing
// at a host that no longer answers.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Every file that names the backend's origin. Keep this list honest. */
const FILES = [
  'mobile/src/config.ts',
  'mobile/eas.json',
  'mediscribe-app/src/config.ts',
  'mediscribe-app/eas.json',
  'backend/scripts/setupRazorpay.ts',
  'deployment.md'
];

/**
 * Hosts we have used. A new one is added here rather than replacing the old,
 * so a half-finished migration is still found by the next run.
 */
const KNOWN_ORIGINS = [
  /https:\/\/clinicbookai-production\.up\.railway\.app/g,
  /https:\/\/clinicbook-ai-backend-production\.up\.railway\.app/g,
  /https:\/\/api\.getanvaya\.com/g,
  /https:\/\/api\.nextdoc\.in/g,
  // Dead, and found in a shipped app's fallback: Render 404s it. Kept in the
  // list so a copy that survives somewhere is caught on the next run.
  /https:\/\/novascribe-ai\.onrender\.com/g
];

const target = process.argv[2];
const write = process.argv.includes('--write');

if (!target) {
  console.log('\nCurrent backend origins in the repo:\n');
  let total = 0;
  for (const rel of FILES) {
    const text = readFileSync(resolve(ROOT, rel), 'utf8');
    const found = new Map();
    for (const re of KNOWN_ORIGINS) {
      for (const m of text.matchAll(re)) found.set(m[0], (found.get(m[0]) ?? 0) + 1);
    }
    if (!found.size) {
      console.log(`  ${rel.padEnd(36)} (none)`);
      continue;
    }
    for (const [origin, n] of found) {
      console.log(`  ${rel.padEnd(36)} ${n} x  ${origin}`);
      total += n;
    }
  }
  console.log(`\n${total} occurrence(s).`);
  console.log('\nTo change them:  node scripts/setApiHost.mjs https://api.getanvaya.com --write\n');
  process.exit(0);
}

if (!/^https:\/\/[a-z0-9.-]+$/i.test(target) || target.endsWith('/')) {
  throw new Error(`Give a bare https origin with no trailing slash, e.g. https://api.getanvaya.com — got "${target}"`);
}

let changed = 0;
for (const rel of FILES) {
  const path = resolve(ROOT, rel);
  const before = readFileSync(path, 'utf8');
  let after = before;
  for (const re of KNOWN_ORIGINS) after = after.replace(re, target);

  if (after === before) {
    console.log(`  ${rel.padEnd(36)} unchanged`);
    continue;
  }
  const n = [...before.matchAll(/https:\/\/[a-z0-9.-]+/gi)].length;
  console.log(`  ${rel.padEnd(36)} ${write ? 'WRITTEN' : 'would change'}  (${n} url(s) scanned)`);
  if (write) writeFileSync(path, after);
  changed++;
}

console.log(`\n${changed} file(s) ${write ? 'updated' : 'would be updated'} → ${target}`);

if (write) {
  console.log(`
Still to do BY HAND — none of these live in the repo:

  1. DNS            an A/CNAME record for that host, pointing at the backend
  2. Railway        Settings -> Networking -> Custom Domain (or the new host's equivalent)
  3. Vercel         VITE_API_URL on the web app, then redeploy
  4. Railway env    PUBLIC_BASE_URL, so the WhatsApp webhook banner is honest
  5. Meta           the webhook callback URL on the WhatsApp app
  6. Razorpay       the webhook URL
  7. Phone apps     rebuild BOTH APKs and redistribute - the old URL is baked
                    into every copy already installed
`);
} else {
  console.log('\nNothing written. Re-run with --write once the new host actually answers.\n');
}
