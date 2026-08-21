import { describe, it, expect, vi, beforeEach } from 'vitest';

// The clinic asked to hear about "every movement". These tests pin the two
// halves of that: what now reaches them, and — just as deliberately — what does
// not.
//
// A feed that buzzes on every inbound message, every draft auto-save and every
// record opened is a feed people mute within a day, and the appointment they DID
// need to see is muted with it. So the rule is: notify when something crossed a
// line a human may act on.

const recorded: Array<Record<string, unknown>> = [];
vi.mock('./notification.service.js', () => ({
  recordNotification: (input: Record<string, unknown>) => recorded.push(input)
}));

const { eventBus } = await import('../events/eventBus.js');
const { registerNotificationSubscriptions } = await import('./notification.subscriptions.js');

registerNotificationSubscriptions();

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  recorded.length = 0;
});

describe('a new patient reaches the clinic', () => {
  it('notifies however they arrived', async () => {
    eventBus.emit('patient.registered', {
      clinicId: 'c1',
      patientId: 'p1',
      patientName: 'Anish Kumar',
      patientCode: 'PT-1042',
      source: 'public'
    });
    await flush();

    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ clinicId: 'c1', type: 'PATIENT_REGISTERED' });
    expect(String(recorded[0].body)).toContain('Anish Kumar');
    expect(String(recorded[0].body)).toContain('PT-1042');
  });

  it('says HOW they arrived, because those are different facts to a clinic', async () => {
    const bodyFor = async (source: string) => {
      recorded.length = 0;
      eventBus.emit('patient.registered', { clinicId: 'c1', patientId: 'p1', patientName: 'A', source });
      await flush();
      return String(recorded[0].body);
    };

    expect(await bodyFor('public')).toContain('self-registered');
    expect(await bodyFor('whatsapp')).toContain('messaged on WhatsApp');
    expect(await bodyFor('staff')).toContain('added at the clinic');
  });

  it('reads sensibly when the name or code is missing', async () => {
    // A WhatsApp auto-onboard has a placeholder name and no code yet.
    eventBus.emit('patient.registered', { clinicId: 'c1', patientId: 'p1' });
    await flush();
    expect(String(recorded[0].body)).toBe('A patient was added at the clinic.');
  });

  it('carries no clinical detail — this renders on a locked screen', async () => {
    eventBus.emit('patient.registered', {
      clinicId: 'c1',
      patientId: 'p1',
      patientName: 'Anish Kumar',
      phone: '+918252317017',
      source: 'public'
    });
    await flush();
    const text = `${recorded[0].title} ${recorded[0].body}`;
    // The name is needed to find them; the phone number is not, and a lock
    // screen is read by whoever is holding the phone.
    expect(text).not.toContain('8252317017');
  });
});

describe('the scribe', () => {
  it('notifies when a doctor finalises a note', async () => {
    eventBus.emit('consultation.finalized', { clinicId: 'c1', consultationNoteId: 'k1', patientId: 'p1' });
    await flush();
    expect(recorded[0]).toMatchObject({ clinicId: 'c1', type: 'CONSULTATION_COMPLETED' });
  });

  it('notifies when a prescription actually reaches the patient', async () => {
    eventBus.emit('prescription.generated', { clinicId: 'c1', prescriptionId: 'k1', patientId: 'p1' });
    await flush();
    expect(recorded[0]).toMatchObject({ clinicId: 'c1', type: 'PRESCRIPTION_SENT' });
  });
});

describe('what must NOT produce a notification', () => {
  it('stays silent on events the clinic cannot act on', async () => {
    // Reminders going out and payments landing are already visible elsewhere.
    // Adding them here is how a feed becomes noise, and noise is how the
    // appointment alert gets muted.
    eventBus.emit('reminder.sent', { clinicId: 'c1', kind: 'medicine' });
    eventBus.emit('payment.success', { clinicId: 'c1', amount: 500 });
    await flush();
    expect(recorded).toEqual([]);
  });

  it('registers its handlers only once, however often the app is built', async () => {
    // The app is constructed more than once in tests, and a double
    // registration would send every clinic two of everything.
    registerNotificationSubscriptions();
    registerNotificationSubscriptions();

    eventBus.emit('patient.registered', { clinicId: 'c1', patientId: 'p1', patientName: 'A' });
    await flush();
    expect(recorded).toHaveLength(1);
  });
});
