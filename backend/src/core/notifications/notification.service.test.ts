import { describe, it, expect, vi, beforeEach } from 'vitest';

// This exists because the push hook went MISSING in production without anyone
// noticing, and the way it went missing is worth writing down.
//
// The hook was added by an edit whose multi-line anchor did not match, because
// this file has CRLF line endings and the anchor used \n. The edit reported
// success, the import line (a single-line change) landed, and the CALL did not.
// Everything compiled. Every test passed. A device registered, a booking created
// its notification — and no phone ever rang, because the one line that sends it
// was not there.
//
// A source-text grep would have caught that particular failure, but not the
// next one — someone deleting the call, or moving it behind an early return.
// So this drives the real function and asserts the real effect.

// The mock ECHOES what it was asked to store. A mock that returns a fixed row
// regardless of input cannot tell "the code read the saved row" from "the code
// read its own argument" — and the hook reads the saved row.
const createRow = (data: Record<string, unknown>) => ({
  id: 'n1',
  createdAt: new Date('2026-08-21T05:40:00.000Z'),
  ...data
});

const pushes: Array<{ clinicId: string; message: Record<string, unknown>; products?: string[] }> = [];
const sse: Array<Record<string, unknown>> = [];

vi.mock('../../config/tenantPrisma.js', () => ({
  forClinic: () => ({
    notification: { create: async ({ data }: { data: Record<string, unknown> }) => createRow(data) }
  })
}));

vi.mock('./notification.realtime.js', () => ({
  publishClinicEvent: (clinicId: string, event: Record<string, unknown>) => sse.push({ clinicId, ...event })
}));

vi.mock('./push.service.js', () => ({
  pushToClinic: (clinicId: string, message: Record<string, unknown>, products?: string[]) =>
    pushes.push({ clinicId, message, products })
}));

const { createNotification, recordNotification } = await import('./notification.service.js');

beforeEach(() => {
  pushes.length = 0;
  sse.length = 0;
});

const input = {
  clinicId: 'c1',
  type: 'APPOINTMENT_BOOKED' as never,
  title: 'New appointment booked',
  body: 'Asha, 4:30 PM',
  appointmentId: 'a1'
};

describe('a notification reaches the phones, not only the open dashboard', () => {
  it('pushes to the clinic — the assertion whose absence nobody noticed', async () => {
    await createNotification(input);
    expect(pushes, 'createNotification did not push').toHaveLength(1);
    expect(pushes[0].clinicId).toBe('c1');
  });

  it('routes by TYPE, not to everyone', async () => {
    // A booking request is front-desk work — the desk confirms it, and it may
    // never reach a doctor's day at all. Sending everything to both apps made
    // each one noise to the person carrying it. See notification.audience.ts.
    await createNotification(input);
    expect(pushes[0].products).toEqual(['clinicbook']);

    pushes.length = 0;
    await createNotification({ ...input, type: 'APPOINTMENT_CONFIRMED' as never });
    expect(pushes[0].products).toEqual(['mediscribe']);
  });

  it('sends the notification’s own words, and ids as data', async () => {
    await createNotification(input);
    expect(pushes[0].message).toMatchObject({
      title: 'New appointment booked',
      body: 'Asha, 4:30 PM',
      data: { type: 'APPOINTMENT_BOOKED', appointmentId: 'a1' }
    });
  });

  it('omits appointmentId rather than sending an empty one', async () => {
    await createNotification({ ...input, appointmentId: null });
    const data = (pushes[0].message as { data: Record<string, string> }).data;
    expect('appointmentId' in data).toBe(false);
  });

  it('still reaches an open dashboard as well', async () => {
    // The SSE path is the one that already worked. Adding push must not have
    // replaced it — a clinic with the dashboard open should get both.
    await createNotification(input);
    expect(sse).toHaveLength(1);
    expect(pushes).toHaveLength(1);
  });

  it('pushes from the fire-and-forget wrapper too', async () => {
    // recordNotification is what nearly every caller actually uses.
    recordNotification(input);
    await new Promise((r) => setTimeout(r, 0));
    expect(pushes).toHaveLength(1);
  });
});
