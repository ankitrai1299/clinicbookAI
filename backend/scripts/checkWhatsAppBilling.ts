/**
 * READ-ONLY. Asks Meta, for every connected clinic, whether its WABA has a
 * currency — which is what tells us Meta will actually take the money and let
 * messages out.
 *
 * Why this exists: the dashboard shows the warning only when the answer is a
 * definite NO. A probe that fails answers "don't know", and "don't know" hides
 * the warning too — so a banner disappearing does not by itself mean billing
 * got done. This prints the raw answer and, when the probe fails, the reason,
 * so the two cannot be confused.
 *
 *   railway run npx tsx scripts/checkWhatsAppBilling.ts
 */

// Read BOTH of these before anything else is imported. The app's own config
// loads .env.local with override:true, so an import here would quietly swap the
// production database handed to us by `railway run` for the local one — and the
// script would cheerfully report "0 channels" about the wrong database.
const DB_URL = process.env.DATABASE_URL;
const ENC_KEY = process.env.WA_CHANNEL_ENC_KEY;

if (!DB_URL) {
  throw new Error('DATABASE_URL is required. Run it under `railway run`, or pass the URL yourself.');
}

const { PrismaClient } = await import('@prisma/client');
const { deriveKey, decryptSecret } = await import('../src/core/whatsapp/whatsapp.crypto.js');
const { buildWhatsAppClient } = await import('../src/config/whatsapp.js');

const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });

// Which database this is actually talking to, so a surprising answer can be
// told apart from a surprising database.
console.log(`
database: ${DB_URL.replace(/\/\/[^@]*@/, '//***@')}`);

const rows = await prisma.whatsAppChannel.findMany({
  orderBy: { updatedAt: 'desc' },
  include: { clinic: { select: { name: true } } }
});

console.log(`\nConnected WhatsApp channels: ${rows.length}\n`);

for (const row of rows) {
  console.log(`${row.clinic?.name ?? '(no clinic)'}  [${row.clinicId}]`);
  console.log(`  number ${row.displayPhoneNumber ?? row.phoneNumberId}   waba ${row.wabaId ?? '-'}`);
  console.log(`  status ${row.status}   registered ${row.registered}`);

  const key = ENC_KEY ? deriveKey(ENC_KEY) : null;
  let client;
  try {
    client = buildWhatsAppClient(decryptSecret(row.accessToken, key));
  } catch (e: any) {
    console.log(`  TOKEN: cannot decrypt — ${e.message}\n`);
    continue;
  }

  try {
    await client.get(`/${row.phoneNumberId}`, { params: { fields: 'id' } });
    console.log('  token: accepted by Meta');
  } catch (e: any) {
    console.log(`  token: REJECTED — ${e.response?.data?.error?.message ?? e.message}`);
  }

  if (!row.wabaId) {
    console.log('  billing: unknown — no WABA id stored\n');
    continue;
  }
  try {
    const waba = await client.get(`/${row.wabaId}`, {
      params: { fields: 'currency,account_review_status,name' }
    });
    const d = waba.data ?? {};
    console.log(`  waba name: ${d.name ?? '-'}   review: ${d.account_review_status ?? '-'}`);
    console.log(
      d.currency
        ? `  billing: SET UP  (currency ${d.currency})`
        : '  billing: NOT SET UP  (no currency — Meta will refuse every send)'
    );
  } catch (e: any) {
    // The case that matters: this is NOT the same as "billing is fine".
    console.log(`  billing: COULD NOT ASK — ${e.response?.data?.error?.message ?? e.message}`);
  }
  console.log();
}

await prisma.$disconnect();
