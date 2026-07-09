// Revoke a public-API key (soft: sets revokedAt; the key stops resolving at once).
//   npx tsx scripts/revokeApiKey.ts <keyIdOrPrefix> [clinicId]
// With no clinicId, uses the first clinic in the DB (local dev convenience).
import '../src/config/env.js';
import { prisma } from '../src/config/prisma.js';
import { listApiKeys, revokeApiKey } from '../src/core/apikeys/apiKey.service.js';

async function main() {
  const target = process.argv[2];
  if (!target) throw new Error('Usage: npx tsx scripts/revokeApiKey.ts <keyIdOrPrefix> [clinicId]');

  let clinicId = process.argv[3];
  if (!clinicId) {
    const clinic = await prisma.clinic.findFirst({ select: { id: true } });
    if (!clinic) throw new Error('No clinic in DB.');
    clinicId = clinic.id;
  }

  const keys = await listApiKeys(clinicId);
  const match = keys.find((k) => k.id === target || k.prefix.startsWith(target));
  if (!match) throw new Error(`No key matching "${target}" for clinic ${clinicId}`);

  await revokeApiKey(clinicId, match.id);
  console.log(`Revoked ${match.prefix}… "${match.name}" (id=${match.id})`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('ERR:', e.message); process.exit(1); });
