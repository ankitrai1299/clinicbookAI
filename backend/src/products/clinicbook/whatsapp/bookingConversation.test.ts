import { describe, it, expect, beforeEach } from 'vitest';

import {
  patientConversation,
  registerPatientConversation,
  resetPatientConversation
} from '../../../core/whatsapp/whatsapp.conversation.js';

// The booking FSM used to be imported straight into core/whatsapp/inbound; it is
// now reached through a registered handler. That is the single most
// business-critical path in the product — every WhatsApp booking goes through it
// — and the registration is one call in createApp() that nothing else would
// notice losing. Silence, not an error, is the failure mode.
describe('booking conversation registration', () => {
  beforeEach(() => resetPatientConversation());

  // Loads the whole product tree (the FSM, skills, the PDF renderer) — seconds,
  // not milliseconds, and slower still when the rest of the suite runs alongside.
  it('is wired up by registering the ClinicBook product', { timeout: 30_000 }, async () => {
    expect(patientConversation()).toBeNull();
    const { registerClinicBook } = await import('../../register.js');
    registerClinicBook();
    expect(
      patientConversation(),
      'ClinicBook did not register its WhatsApp conversation — patients would get the no-booking-product reply'
    ).not.toBeNull();
  });

  it('hands core the message unchanged and returns the reply verbatim', async () => {
    // core does no interpretation on the way in or out: the FSM decides the words,
    // and a null means stay silent rather than send an empty message.
    const seen: unknown[] = [];
    registerPatientConversation(async (msg) => {
      seen.push(msg);
      return msg.message === 'quiet' ? null : `echo:${msg.message}`;
    });

    const converse = patientConversation()!;
    const msg = {
      clinicId: 'c1',
      patientId: 'p1',
      patientName: 'Asha',
      clinicName: 'NextClinic',
      phone: '919876543210',
      message: 'book',
      replyId: 'OPT_1',
      fromVoice: true
    };

    expect(await converse(msg)).toBe('echo:book');
    expect(seen[0]).toEqual(msg);
    expect(await converse({ ...msg, message: 'quiet' })).toBeNull();
  });
});
