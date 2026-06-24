/**
 * P1-4: appointment lifecycle guard. Only legal transitions may occur; a
 * completed or cancelled appointment can NEVER be reopened.
 *
 *   Run:  npx tsx scripts/testStatusTransitions.ts
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { AppointmentStatus } = await import('@prisma/client');
const { isValidTransition } = await import('../src/modules/appointments/appointment.service.js');
const S = AppointmentStatus;

let pass = 0, fail = 0;
const ok = (cond: boolean, msg: string) => { if (cond) { pass++; console.log(`  ✓ ${msg}`); } else { fail++; console.error(`  ✗ ${msg}`); } };

const run = async () => {
  console.log('Legal transitions:');
  ok(isValidTransition(S.PENDING, S.CONFIRMED), 'PENDING → CONFIRMED');
  ok(isValidTransition(S.PENDING, S.CANCELLED), 'PENDING → CANCELLED');
  ok(isValidTransition(S.CONFIRMED, S.COMPLETED), 'CONFIRMED → COMPLETED');
  ok(isValidTransition(S.CONFIRMED, S.CANCELLED), 'CONFIRMED → CANCELLED');
  ok(isValidTransition(S.CONFIRMED, S.NO_SHOW), 'CONFIRMED → NO_SHOW');

  console.log('\nIllegal transitions (must be blocked):');
  ok(!isValidTransition(S.COMPLETED, S.PENDING), 'COMPLETED → PENDING blocked (no reopening)');
  ok(!isValidTransition(S.COMPLETED, S.CONFIRMED), 'COMPLETED → CONFIRMED blocked');
  ok(!isValidTransition(S.COMPLETED, S.CANCELLED), 'COMPLETED → CANCELLED blocked');
  ok(!isValidTransition(S.CANCELLED, S.CONFIRMED), 'CANCELLED → CONFIRMED blocked (no reactivation)');
  ok(!isValidTransition(S.CANCELLED, S.PENDING), 'CANCELLED → PENDING blocked');
  ok(!isValidTransition(S.PENDING, S.COMPLETED), 'PENDING → COMPLETED blocked (must confirm first)');
  ok(!isValidTransition(S.NO_SHOW, S.CONFIRMED), 'NO_SHOW → CONFIRMED blocked');
  ok(!isValidTransition(S.COMPLETED, S.NO_SHOW), 'COMPLETED → NO_SHOW blocked');

  console.log('\nIdempotent same-state:');
  ok(isValidTransition(S.COMPLETED, S.COMPLETED), 'COMPLETED → COMPLETED (no-op allowed)');

  console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILED'} — ${pass} passed, ${fail} failed`);
};

run().catch((e) => { console.error(e); fail++; }).finally(() => process.exit(fail === 0 ? 0 : 1));
