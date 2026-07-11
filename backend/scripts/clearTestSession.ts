// One-off: clear the stuck brain ConversationSession for the test patient so the
// next message re-routes cleanly. Points at the LIVE (.env) DB explicitly.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const url = fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8').match(/^DATABASE_URL\s*=\s*"?([^"\n\r]+)"?/m)?.[1];
if (!url) throw new Error('DATABASE_URL not found');
const prisma = new PrismaClient({ datasourceUrl: url });

const CLINIC_ID = 'cmqkubvis0000rt0pbfkkulae';
const PATIENT_ID = 'cmqm02k1j0001mv0119i66xin';

const res = await prisma.conversationSession.updateMany({
  where: { clinicId: CLINIC_ID, patientId: PATIENT_ID, channel: 'whatsapp' },
  data: { activeSkill: null, data: '{}' }
});
console.log('Cleared test session rows:', res.count);
await prisma.$disconnect();
