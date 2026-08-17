import { describe, it, expect, vi, beforeEach } from 'vitest';

// The consent store and the audit writer are mocked so the RULES can be tested
// exactly — especially the one that decides whether a live clinic's reminders
// keep working on the day this ships.

interface Row {
  clinicId: string;
  patientId: string;
  purpose: string;
  status: string;
  phoneKey: string | null;
  noticeVersion: string;
  channel: string;
  evidence: string | null;
}

const rows: Row[] = [];
const audited: Array<Record<string, unknown>> = [];
let failReads = false;
let failWrites = false;

const key = (r: { clinicId: string; patientId: string; purpose: string }) =>
  `${r.clinicId}|${r.patientId}|${r.purpose}`;

vi.mock('../../config/prisma.js', () => ({
  prisma: {
    patientConsent: {
      upsert: async ({ where, create, update }: any) => {
        if (failWrites) throw new Error('db down');
        const k = key(where.clinicId_patientId_purpose);
        const existing = rows.find((r) => key(r) === k);
        if (existing) Object.assign(existing, update);
        else rows.push({ ...where.clinicId_patientId_purpose, ...create });
        return {};
      },
      findUnique: async ({ where }: any) => {
        if (failReads) throw new Error('db down');
        return rows.find((r) => key(r) === key(where.clinicId_patientId_purpose)) ?? null;
      },
      findFirst: async ({ where }: any) => {
        if (failReads) throw new Error('db down');
        return (
          rows.find(
            (r) =>
              r.clinicId === where.clinicId &&
              r.phoneKey === where.phoneKey &&
              r.purpose === where.purpose &&
              r.status === where.status
          ) ?? null
        );
      }
    }
  }
}));

vi.mock('../audit/audit.service.js', () => ({
  record: (e: Record<string, unknown>) => {
    audited.push(e);
  }
}));

const {
  grantConsent,
  withdrawConsent,
  mayMessage,
  phoneKey,
  clearOptOutCache,
  hasSeenCurrentNotice,
  recordNoticeShown,
  consentStatus
} = await import('./consent.service.js');

const { NOTICE_VERSION, isOptOutMessage, isOptInMessage } = await import('./notice.js');

beforeEach(() => {
  rows.length = 0;
  audited.length = 0;
  failReads = false;
  failWrites = false;
  clearOptOutCache();
});

describe('who may be messaged', () => {
  it('allows a patient who has never been asked — nothing stops on day one', () => {
    // THE decision this phase turns on. Every patient in a live clinic today has
    // no consent row: they messaged the clinic first, or staff booked them.
    // Requiring a row before sending would silence every appointment reminder in
    // production the moment this deployed. They are shown the notice instead.
    return expect(mayMessage('c1', '+91 79038 84686')).resolves.toBe(true);
  });

  it('refuses a patient who said STOP', async () => {
    await withdrawConsent({
      clinicId: 'c1',
      patientId: 'p1',
      purpose: 'whatsapp_messaging',
      channel: 'whatsapp',
      phone: '917903884686'
    });
    clearOptOutCache();
    expect(await mayMessage('c1', '917903884686')).toBe(false);
  });

  it('recognises the same person however their number is written', async () => {
    // The withdrawal is stored from one format and checked from another. If this
    // ever stops matching, a patient who opted out keeps getting messages and
    // nobody finds out — which is why the key is stored rather than derived
    // through a join.
    await withdrawConsent({
      clinicId: 'c1',
      patientId: 'p1',
      purpose: 'whatsapp_messaging',
      channel: 'whatsapp',
      phone: '+91 79038 84686'
    });
    clearOptOutCache();

    for (const shape of ['917903884686', '+917903884686', '07903884686', '7903884686', '+91 79038-84686']) {
      expect(await mayMessage('c1', shape), shape).toBe(false);
      clearOptOutCache();
    }
  });

  it('keeps an opt-out inside the clinic it was given to', async () => {
    // A patient may use two clinics on the shared number. Saying STOP to one is
    // not saying STOP to the other, and treating it as such would silently cut a
    // second clinic's reminders.
    await withdrawConsent({
      clinicId: 'c1',
      patientId: 'p1',
      purpose: 'whatsapp_messaging',
      channel: 'whatsapp',
      phone: '917903884686'
    });
    clearOptOutCache();
    expect(await mayMessage('c1', '917903884686')).toBe(false);
    expect(await mayMessage('c2', '917903884686')).toBe(true);
  });

  it('lets a patient turn messages back on', async () => {
    await withdrawConsent({
      clinicId: 'c1', patientId: 'p1', purpose: 'whatsapp_messaging', channel: 'whatsapp', phone: '917903884686'
    });
    clearOptOutCache();
    expect(await mayMessage('c1', '917903884686')).toBe(false);

    await grantConsent({
      clinicId: 'c1', patientId: 'p1', purpose: 'whatsapp_messaging', channel: 'whatsapp', phone: '917903884686'
    });
    clearOptOutCache();
    expect(await mayMessage('c1', '917903884686')).toBe(true);
  });

  it('allows the send when the consent table cannot be read', async () => {
    // Fails OPEN, on purpose: a database blip must not take out a clinic's
    // reminders. The withdrawal gate is a compliance control, not a safety
    // interlock — the safety interlock is doctor approval, which fails closed.
    failReads = true;
    expect(await mayMessage('c1', '917903884686')).toBe(true);
  });

  it('does not block when there is no clinic or no number to check', async () => {
    expect(await mayMessage(null, '917903884686')).toBe(true);
    expect(await mayMessage('c1', '')).toBe(true);
  });
});

describe('recording what happened', () => {
  it('audits a grant and a withdrawal without storing anything clinical', async () => {
    await grantConsent({
      clinicId: 'c1', patientId: 'p1', purpose: 'consultation_recording', channel: 'web',
      evidence: 'doctor confirmed the patient was informed', actorId: 'u1', actorRole: 'CLINIC_ADMIN'
    });
    await withdrawConsent({
      clinicId: 'c1', patientId: 'p1', purpose: 'whatsapp_messaging', channel: 'whatsapp', phone: '917903884686'
    });

    expect(audited.map((a) => a.action)).toEqual(['CONSENT_GRANTED', 'CONSENT_WITHDRAWN']);
    expect(audited[0]).toMatchObject({ patientId: 'p1', actorId: 'u1', resourceId: 'consultation_recording' });
    // A patient withdrawing is the PATIENT acting, not a staff member.
    expect(audited[1].actorType).toBe('patient');
  });

  it('tells the caller when a withdrawal did not land', async () => {
    // The caller is about to reply "done, no more messages". Saying that when
    // the write failed is a lie the patient will act on, so this one reports.
    failWrites = true;
    expect(await withdrawConsent({
      clinicId: 'c1', patientId: 'p1', purpose: 'whatsapp_messaging', channel: 'whatsapp', phone: '9'
    })).toBe(false);
  });

  it('never lets a failed grant break the caller', async () => {
    failWrites = true;
    await expect(
      grantConsent({ clinicId: 'c1', patientId: 'p1', purpose: 'ai_processing', channel: 'web' })
    ).resolves.toBeUndefined();
  });

  it('reports a purpose nobody has been asked about as null, not as refused', async () => {
    // "Never asked" and "said no" are different facts and the UI must be able to
    // tell them apart.
    expect(await consentStatus('c1', 'p1', 'consultation_recording')).toBeNull();
    await grantConsent({ clinicId: 'c1', patientId: 'p1', purpose: 'consultation_recording', channel: 'web' });
    expect(await consentStatus('c1', 'p1', 'consultation_recording')).toBe('granted');
  });
});

describe('the privacy notice', () => {
  it('is shown once per patient per version', async () => {
    expect(await hasSeenCurrentNotice('c1', 'p1')).toBe(false);
    await recordNoticeShown({ clinicId: 'c1', patientId: 'p1', channel: 'whatsapp', phone: '917903884686' });
    expect(await hasSeenCurrentNotice('c1', 'p1')).toBe(true);
  });

  it('is shown again when the notice text changes', async () => {
    // Consent is consent to a PARTICULAR notice. Someone who saw the old text
    // has not been told what the new one added.
    await recordNoticeShown({
      clinicId: 'c1', patientId: 'p1', channel: 'whatsapp', noticeVersion: '2020-01-01.1'
    });
    expect(await hasSeenCurrentNotice('c1', 'p1')).toBe(false);
  });

  it('treats an unreadable table as "already seen"', async () => {
    // The opposite default would spam a patient with the notice on every single
    // message. One missed notice is recoverable; twenty is not.
    failReads = true;
    expect(await hasSeenCurrentNotice('c1', 'p1')).toBe(true);
  });

  it('has a version that looks like one', () => {
    expect(NOTICE_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });
});

describe('reading STOP correctly', () => {
  it('recognises the ways people actually type it', () => {
    for (const text of ['STOP', 'stop', 'Stop.', ' unsubscribe ', 'band karo', 'ROKO', 'बंद करो']) {
      expect(isOptOutMessage(text), text).toBe(true);
    }
  });

  it('does not opt someone out because the word appears in a sentence', () => {
    // Substring matching here would cut a patient's reminders for asking a
    // question — the failure would look exactly like a bug they cannot report.
    for (const text of [
      "please don't stop my reminders",
      'stop pain kab tak rahega',
      'I want to stop taking this medicine',
      'my appointment band ho gaya kya'
    ]) {
      expect(isOptOutMessage(text), text).toBe(false);
    }
  });

  it('does not read a booking menu choice as an opt-out', () => {
    // The FSM's numbered menu is what most inbound messages are.
    for (const text of ['1', '2', '3', 'book appointment', 'yes']) {
      expect(isOptOutMessage(text), text).toBe(false);
    }
  });

  it('recognises START without confusing it with anything else', () => {
    expect(isOptInMessage('START')).toBe(true);
    expect(isOptInMessage('chalu karo')).toBe(true);
    expect(isOptInMessage('when does the clinic start')).toBe(false);
  });
});

describe('the phone key', () => {
  it('is the last ten digits, matching the inbound resolver', () => {
    expect(phoneKey('+91 79038 84686')).toBe('7903884686');
    expect(phoneKey('917903884686')).toBe('7903884686');
    expect(phoneKey('07903884686')).toBe('7903884686');
    expect(phoneKey('7903884686')).toBe('7903884686');
    expect(phoneKey('')).toBe('');
    expect(phoneKey(null)).toBe('');
  });
});
