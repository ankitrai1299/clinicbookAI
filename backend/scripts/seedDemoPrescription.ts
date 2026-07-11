// One-off: seed a DEMO FINALIZED prescription for the test patient so the
// NovaScribe brain skill has something to return. Additive (one new row), points
// at the LIVE (.env / Supabase) DB explicitly. Logs the created id so it can be
// deleted later. Idempotent-ish: skips if a demo note already exists.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envText = fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8');
const url = envText.match(/^DATABASE_URL\s*=\s*"?([^"\n\r]+)"?/m)?.[1];
if (!url) throw new Error('DATABASE_URL not found in backend/.env');
const prisma = new PrismaClient({ datasourceUrl: url });

const CLINIC_ID = 'cmqkubvis0000rt0pbfkkulae';
const PATIENT_ID = 'cmqm02k1j0001mv0119i66xin'; // PT-7SK8CM (ankit, test number …4686)
const MARKER = '[DEMO seed — safe to delete]';

const existing = await prisma.consultationNote.findFirst({
  where: { clinicId: CLINIC_ID, patientId: PATIENT_ID, status: 'FINALIZED', errorMessage: MARKER },
  select: { id: true }
});
if (existing) {
  console.log('Demo finalized prescription already exists:', existing.id);
} else {
  const note = await prisma.consultationNote.create({
    data: {
      clinicId: CLINIC_ID,
      patientId: PATIENT_ID,
      patientName: 'ankit',
      doctorName: 'Rai',
      status: 'FINALIZED',
      assessment: 'Seasonal viral fever with throat infection.',
      plan: 'Rest and plenty of fluids. Complete the full antibiotic course. Return if fever persists beyond 3 days.',
      prescription: [
        { drug: 'Paracetamol 500mg', dose: '1 tablet', frequency: 'thrice a day', duration: '3 days', notes: 'after meals' },
        { drug: 'Azithromycin 250mg', dose: '1 tablet', frequency: 'once a day', duration: '5 days', notes: 'before breakfast' },
        { drug: 'Cetirizine 10mg', dose: '1 tablet', frequency: 'at night', duration: '5 days' }
      ],
      errorMessage: MARKER
    },
    select: { id: true }
  });
  console.log('Created demo FINALIZED prescription note:', note.id);
}

await prisma.$disconnect();
