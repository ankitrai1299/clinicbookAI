// Mint a public-API key for a clinic. The plaintext is printed ONCE — copy it
// into the partner's env; we only ever store its hash.
//   npx tsx scripts/issueApiKey.ts "Partner name" [clinicId]
// With no clinicId, uses the first clinic in the DB (local dev convenience).
import '../src/config/env.js';
import { prisma } from '../src/config/prisma.js';
import { issueApiKey, listApiKeys } from '../src/core/apikeys/apiKey.service.js';

async function main() {
  const name = process.argv[2] ?? 'Local test key';
  let clinicId = process.argv[3];

  if (!clinicId) {
    const clinic = await prisma.clinic.findFirst({ select: { id: true, name: true } });
    if (!clinic) throw new Error('No clinic in DB.');
    clinicId = clinic.id;
    console.log(`Clinic: ${clinic.name} (${clinic.id})`);
  }

  const key = await issueApiKey(clinicId, name);
  console.log(`\nIssued "${key.name}"  id=${key.id}  prefix=${key.prefix}`);
  console.log('\n=== API KEY (shown once, store it now) ===');
  console.log(key.plaintext);
  console.log('==========================================\n');

  const all = await listApiKeys(clinicId);
  console.log(`Keys for this clinic: ${all.length}`);
  for (const k of all) {
    console.log(`  - ${k.prefix}… "${k.name}"${k.revokedAt ? ' [REVOKED]' : ''}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error('ERR:', e.message); process.exit(1); });
