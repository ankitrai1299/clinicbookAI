// End-to-end webhook verification against the LOCAL dev DB. Stands up a real HTTP
// receiver, books/cancels a real appointment, drains the outbox, and asserts:
//   - the event reached the outbox (durable, not fire-and-forget)
//   - the POST is signed and OUR OWN verifySignature accepts it
//   - a 500 leaves the delivery PENDING with a backed-off nextAttemptAt
//   - the last attempt parks it as FAILED with the reason
//   npx tsx scripts/verifyWebhooks.ts
import './../src/config/env.js';
import http from 'http';
import { AppointmentStatus } from '@prisma/client';

import { prisma } from '../src/config/prisma.js';
import { registerWebhookSubscriptions } from '../src/core/webhooks/webhook.subscriptions.js';
import { registerWebhook, verifySignature } from '../src/core/webhooks/webhook.service.js';
import { processWebhookDeliveries } from '../src/core/webhooks/webhookDelivery.service.js';
import { createAppointment, cancelAppointment } from '../src/products/clinicbook/appointments/appointment.service.js';

const PORT = 5055;
let pass = 0, fail = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`, detail !== undefined ? JSON.stringify(detail) : ''); }
};

interface Received { body: string; headers: http.IncomingHttpHeaders }
const received: Received[] = [];
let respondWith = 200;

const startReceiver = () =>
  new Promise<http.Server>((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        received.push({ body, headers: req.headers });
        res.writeHead(respondWith).end();
      });
    });
    server.listen(PORT, () => resolve(server));
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const clinic = await prisma.clinic.findFirst({ select: { id: true, name: true } });
  if (!clinic) throw new Error('No clinic in local DB.');
  const doctor = await prisma.doctor.findFirst({ where: { clinicId: clinic.id, name: 'Dr. Verify Bot' }, select: { id: true } });
  const patient = await prisma.patient.findFirst({ where: { clinicId: clinic.id, phone: '+910000000001' }, select: { id: true } });
  if (!doctor || !patient) throw new Error('Run scripts/verifyDatasource.ts first (seeds Dr. Verify Bot + patient).');

  const server = await startReceiver();
  registerWebhookSubscriptions();

  // Fresh endpoint each run; keep the DB tidy afterwards.
  const hook = await registerWebhook(clinic.id, `http://localhost:${PORT}/hook`, [
    'appointment.booked',
    'appointment.cancelled'
  ]);
  console.log(`Clinic: ${clinic.name}\nEndpoint: ${hook.id} -> ${hook.url}\n`);

  // Use a slot far out so we never collide with the other harness.
  const dateStr = new Date(Date.now() + 9 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const stale = await prisma.appointment.findFirst({
    where: { clinicId: clinic.id, doctorId: doctor.id, appointmentDate: new Date(`${dateStr}T00:00:00.000Z`), status: { not: 'CANCELLED' } }
  });
  if (stale) await prisma.appointment.update({ where: { id: stale.id }, data: { status: 'CANCELLED' } });

  console.log('DELIVERY (happy path):');
  const appt = await createAppointment(
    clinic.id,
    { doctorId: doctor.id, patientId: patient.id, appointmentDate: dateStr, appointmentTime: '04:00 PM' },
    { notify: false }
  );
  await sleep(400); // the bus handler writes the outbox row asynchronously

  const queued = await prisma.webhookDelivery.count({ where: { endpointId: hook.id, event: 'appointment.booked' } });
  check('appointment.booked landed in the outbox (durable)', queued === 1, { queued });

  await processWebhookDeliveries();
  check('receiver got exactly one POST', received.length === 1, { got: received.length });

  const got = received[0];
  const sig = String(got?.headers['x-clinicbook-signature'] ?? '');
  check('X-ClinicBook-Event header is set', got?.headers['x-clinicbook-event'] === 'appointment.booked');
  check('X-ClinicBook-Delivery header is set (partner dedupe key)', !!got?.headers['x-clinicbook-delivery']);
  check('signature verifies with the partner secret', verifySignature(hook.secret, got.body, sig, Math.floor(Date.now() / 1000)));
  check('a tampered body fails verification', !verifySignature(hook.secret, got.body + ' ', sig, Math.floor(Date.now() / 1000)));
  const parsed = JSON.parse(got.body);
  check('payload carries id + event + data.appointmentId',
    !!parsed.id && parsed.event === 'appointment.booked' && parsed.data?.appointmentId === appt.id);

  const delivered = await prisma.webhookDelivery.findFirst({ where: { endpointId: hook.id, event: 'appointment.booked' } });
  check('delivery marked DELIVERED', delivered?.status === 'DELIVERED', { status: delivered?.status });

  console.log('\nRETRY (receiver returns 500):');
  respondWith = 500;
  await cancelAppointment(clinic.id, appt.id);
  await sleep(400);
  await processWebhookDeliveries();

  const failed = await prisma.webhookDelivery.findFirst({ where: { endpointId: hook.id, event: 'appointment.cancelled' } });
  check('still PENDING after a 500 (will retry)', failed?.status === 'PENDING', { status: failed?.status });
  check('attempts incremented to 1', failed?.attempts === 1, { attempts: failed?.attempts });
  check('nextAttemptAt backed off into the future', !!failed && failed.nextAttemptAt.getTime() > Date.now());
  check('lastError records the HTTP status', failed?.lastError === 'HTTP 500', { lastError: failed?.lastError });

  console.log('\nGIVE UP (last attempt):');
  // Park it on its final attempt and make it due again.
  await prisma.webhookDelivery.update({
    where: { id: failed!.id },
    data: { attempts: 5, nextAttemptAt: new Date(Date.now() - 1000) }
  });
  await processWebhookDeliveries();
  const dead = await prisma.webhookDelivery.findUnique({ where: { id: failed!.id } });
  check('parked as FAILED after MAX_ATTEMPTS', dead?.status === 'FAILED', { status: dead?.status, attempts: dead?.attempts });

  // Cleanup: drop this run's endpoint (deliveries cascade).
  await prisma.webhookEndpoint.delete({ where: { id: hook.id } });
  server.close();

  console.log(`\nResult: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('ERR:', e); process.exit(1); });
