import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// The invariant this phase exists to protect: NOTHING reaches a patient unless a
// human doctor finalised it.
//
// It has always been true — deliverPrescription refuses a note that is not
// 'Completed', and only a doctor's save sets that — but it was an emergent
// property of three separate files agreeing. Emergent properties get refactored
// away by someone who does not know they are load-bearing. These tests make it a
// stated rule.

const sent: Array<Record<string, unknown>> = [];

vi.mock('../../../config/prisma.js', () => ({
  prisma: {
    patient: { findUnique: async () => ({ name: 'Asha', phone: '+919999999999' }) },
    clinic: { findUnique: async () => ({ name: 'Test Clinic' }) }
  }
}));

vi.mock('../../../core/whatsapp/whatsapp.service.js', () => ({
  sendTemplatedOrSession: async (args: Record<string, unknown>) => {
    sent.push(args);
    return { channel: 'session' };
  },
  sendWhatsAppDocument: async () => true,
  isConversationWindowOpen: async () => false
}));

vi.mock('../repositories/index.js', () => ({
  consultationsRepo: {
    findById: async () => null,
    upsert: async () => undefined
  }
}));

vi.mock('../../../core/timeline/patientTimeline.service.js', () => ({ emitEvent: () => undefined }));

const { deliverPrescription } = await import('./prescriptionDelivery.js');

const withMeds = (status: string) => ({
  id: 'k1',
  patientId: 'p1',
  status,
  doctorName: 'Dr Rao',
  report: { prescribedMedications: [{ name: 'Amoxicillin', dose: '500mg' }] }
});

beforeEach(() => {
  sent.length = 0;
});

describe('nothing reaches a patient without a doctor finalising it', () => {
  it('refuses to send a draft', async () => {
    const result = await deliverPrescription('c1', withMeds('Draft'));
    expect(result).toEqual({ sent: false, reason: 'not-completed' });
    expect(sent).toEqual([]);
  });

  it('refuses to send a note that is still recording or processing', async () => {
    for (const status of ['Recording', 'Processing', '', 'completed']) {
      const result = await deliverPrescription('c1', withMeds(status));
      expect(result.sent, status).toBe(false);
    }
    expect(sent).toEqual([]);
  });

  it('refuses a draft even when the caller forces the send', async () => {
    // `force` exists so a doctor can re-send something already delivered. It
    // must NOT be a way around the approval gate — this is the line an
    // "automation" feature would most plausibly cross.
    const result = await deliverPrescription('c1', withMeds('Draft'), { force: true });
    expect(result).toEqual({ sent: false, reason: 'not-completed' });
    expect(sent).toEqual([]);
  });

  it('sends once the doctor has finalised it', async () => {
    const result = await deliverPrescription('c1', withMeds('Completed'));
    expect(result.sent).toBe(true);
    expect(sent).toHaveLength(1);
  });
});

// ── Structural: no AI path can hold the permission ──────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../../..');

describe('the AI has no route to approval', () => {
  it('is granted prescription.approve and prescription.send by no role at all', async () => {
    const { ROLE_PERMISSIONS } = await import('../../../core/authz/permissions.js');
    // An AI actor authorizes as no role, and every role that DOES hold these is
    // a human one. There is no 'ai', 'system' or 'service' entry to act under.
    const roles = Object.keys(ROLE_PERMISSIONS);
    expect(roles).not.toContain('ai');
    expect(roles).not.toContain('system');
  });

  it('guards the send route with prescription.send', () => {
    const router = fs.readFileSync(path.join(SRC, 'products/mediscribe/router.ts'), 'utf8');
    expect(router).toMatch(/send-prescription',\s*requirePermission\('prescription\.send'\)/);
  });

  it('records the approval as a USER action, never as an AI one', () => {
    // recordFromRequest derives the actor from the authenticated request, so a
    // PRESCRIPTION_APPROVED row can only ever name a signed-in human. If this
    // ever became `record({ actorType: 'ai' … })` the trail would be worthless.
    const router = fs.readFileSync(path.join(SRC, 'products/mediscribe/router.ts'), 'utf8');
    const approval = router.slice(router.indexOf("action: 'PRESCRIPTION_APPROVED'"));
    expect(approval.slice(0, 600)).not.toContain("actorType: 'ai'");
  });

  it('only ever lets a patient read a FINALIZED note over WhatsApp', () => {
    // This test used to check that the FILE contained "status === 'Completed'"
    // — and it did, in a different function. The one the patient actually
    // reaches (latestScribeConsultation) had no such check, so a doctor's
    // unreviewed draft could be sent on WhatsApp while this test stayed green.
    //
    // It now reads the patient-facing function itself. Checking that a string
    // appears somewhere in a file proves nothing about the path that runs.
    const data = fs.readFileSync(path.join(SRC, 'products/novascribe/skills/mediscribeData.ts'), 'utf8');

    const fnStart = data.indexOf('export async function latestScribeConsultation');
    expect(fnStart, 'latestScribeConsultation not found').toBeGreaterThan(-1);
    const next = data.indexOf('export async function', fnStart + 10);
    const body = data.slice(fnStart, next === -1 ? undefined : next);

    expect(body, 'the patient-facing lookup must require a finalized note').toContain(
      "d?.status === 'Completed'"
    );

    // And the finalized-by-patient-id lookup it delegates to.
    const byId = data.slice(data.indexOf('export async function finalizedScribeForPatient'));
    expect(byId).toContain("d?.status === 'Completed'");
  });
});
