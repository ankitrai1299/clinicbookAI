// Mint a public-API key for a clinic. The plaintext is printed ONCE — copy it
// into the partner's env; we only ever store its hash.
//   npx tsx scripts/issueApiKey.ts "Partner name" [clinicId] [live|test] [read|read,write]
//
// Prefer the dashboard's "Developers & API" tab. This exists for support and for
// seeding local dev. A `test` key provisions the clinic's sandbox twin.
import '../src/config/env.js';
import { ApiKeyMode } from '@prisma/client';

import { prisma } from '../src/config/prisma.js';
import { type ApiScope, isApiScope, issueApiKey, listApiKeys } from '../src/core/apikeys/apiKey.service.js';

async function main() {
  const name = process.argv[2] ?? 'Local test key';
  let clinicId = process.argv[3];
  const mode = (process.argv[4] ?? 'live').toLowerCase() === 'test' ? ApiKeyMode.TEST : ApiKeyMode.LIVE;

  const scopes = (process.argv[5] ?? 'read,write').split(',').map((s) => s.trim());
  const bad = scopes.filter((s) => !isApiScope(s));
  if (bad.length) throw new Error(`Unknown scope(s): ${bad.join(', ')}. Valid: read, write`);

  if (!clinicId) {
    // `isSandbox: false` — never silently mint a key against a sandbox twin just
    // because it happened to be the first row.
    const clinic = await prisma.clinic.findFirst({ where: { isSandbox: false }, select: { id: true, name: true } });
    if (!clinic) throw new Error('No clinic in DB.');
    clinicId = clinic.id;
    console.log(`Clinic: ${clinic.name} (${clinic.id})`);
  }

  const key = await issueApiKey(clinicId, name, { mode, scopes: scopes as ApiScope[] });
  console.log(`\nIssued "${key.name}"  id=${key.id}  mode=${key.mode}  scopes=${key.scopes.join(',')}`);
  if (key.mode === ApiKeyMode.TEST) {
    console.log(`Sandbox clinic: ${key.clinicId} (demo doctors seeded; WhatsApp suppressed)`);
  }
  console.log('\n=== API KEY (shown once, store it now) ===');
  console.log(key.plaintext);
  console.log('==========================================\n');

  const all = await listApiKeys(clinicId);
  console.log(`Keys for this clinic: ${all.length}`);
  for (const k of all) {
    console.log(`  - ${k.prefix}… "${k.name}" [${k.mode}/${k.scopes.join('+')}]${k.revokedAt ? ' [REVOKED]' : ''}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error('ERR:', e.message); process.exit(1); });
