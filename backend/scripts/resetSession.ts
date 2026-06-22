/** Reset a stuck WhatsApp FSM session (clears state only; sends nothing). */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { prisma } = await import('../src/config/prisma.js');

const NATIONAL = process.argv[2] ?? '7903884686';
const before = await prisma.whatsAppSession.findMany({ where: { phone: { contains: NATIONAL } } });
console.log(`Found ${before.length} session(s):`);
for (const s of before) console.log(`  ${s.phone} | state=${s.state}`);

const res = await prisma.whatsAppSession.deleteMany({ where: { phone: { contains: NATIONAL } } });
console.log(`\nDeleted ${res.count} session row(s) → next inbound starts fresh (IDLE → menu).`);
await prisma.$disconnect();
