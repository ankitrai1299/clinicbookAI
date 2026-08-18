import { describe, it, expect, vi, beforeEach } from 'vitest';

// A push renders on a LOCKED screen, in front of whoever is holding the phone.
// That single fact drives most of what is asserted here.

const rows: Array<{ token: string; clinicId: string; userId: string; product: string }> = [];
const deleted: string[][] = [];
let sent: Array<Record<string, unknown>> = [];
let expoResponse: { ok: boolean; body: unknown } = { ok: true, body: { data: [] } };

vi.mock('../../config/prisma.js', () => ({
  prisma: {
    devicePushToken: {
      findMany: async ({ where }: any) =>
        rows.filter(
          (r) =>
            (!where.clinicId || r.clinicId === where.clinicId) &&
            (!where.userId || r.userId === where.userId) &&
            (!where.product?.in || where.product.in.includes(r.product))
        ),
      deleteMany: async ({ where }: any) => {
        if (where.token?.in) deleted.push(where.token.in);
        return { count: 0 };
      },
      updateMany: async () => ({ count: 0 }),
      upsert: async ({ create }: any) => create
    }
  }
}));

const { isExpoPushToken, pushToClinic, registerDevice } = await import('./push.service.js');

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  rows.length = 0;
  deleted.length = 0;
  sent = [];
  expoResponse = { ok: true, body: { data: [] } };

  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    sent = JSON.parse(String(init.body));
    return {
      ok: expoResponse.ok,
      status: expoResponse.ok ? 200 : 500,
      json: async () => expoResponse.body,
      text: async () => JSON.stringify(expoResponse.body)
    } as unknown as Response;
  });
});

describe('registering a device', () => {
  it('accepts an Expo token and refuses anything else', async () => {
    expect(isExpoPushToken('ExponentPushToken[abc123]')).toBe(true);
    expect(isExpoPushToken('ExpoPushToken[abc123]')).toBe(true);
    expect(isExpoPushToken('not-a-token')).toBe(false);
    expect(isExpoPushToken('')).toBe(false);

    await expect(
      registerDevice({ clinicId: 'c1', userId: 'u1', token: 'garbage', product: 'clinicbook' })
    ).rejects.toThrow(/not an Expo push token/);
  });
});

describe('what a push carries', () => {
  beforeEach(() => {
    rows.push({ token: 'ExponentPushToken[a]', clinicId: 'c1', userId: 'u1', product: 'clinicbook' });
    expoResponse = { ok: true, body: { data: [{ status: 'ok', id: 'x' }] } };
  });

  it('sends the title, body and ids — and nothing else', async () => {
    pushToClinic('c1', {
      title: 'New appointment',
      body: 'A patient booked for 4:30 PM',
      data: { appointmentId: 'a1', type: 'NEW_BOOKING' }
    });
    await flush();

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: 'ExponentPushToken[a]',
      title: 'New appointment',
      data: { appointmentId: 'a1', type: 'NEW_BOOKING' }
    });
  });

  it('asks for a channel and high priority, or Android delivers it silently', () => {
    // Without channelId the notification does not make a sound on modern
    // Android — which for the desk is the same as not arriving.
    pushToClinic('c1', { title: 'x', body: 'y' });
    return flush().then(() => {
      expect(sent[0].channelId).toBe('default');
      expect(sent[0].priority).toBe('high');
      expect(sent[0].sound).toBe('default');
    });
  });
});

describe('who gets it', () => {
  beforeEach(() => {
    rows.push(
      { token: 'ExponentPushToken[desk]', clinicId: 'c1', userId: 'u1', product: 'clinicbook' },
      { token: 'ExponentPushToken[doc]', clinicId: 'c1', userId: 'u2', product: 'mediscribe' },
      { token: 'ExponentPushToken[other]', clinicId: 'c2', userId: 'u3', product: 'clinicbook' }
    );
    expoResponse = { ok: true, body: { data: [{ status: 'ok' }, { status: 'ok' }] } };
  });

  it('never reaches another clinic', async () => {
    pushToClinic('c1', { title: 'x', body: 'y' });
    await flush();
    const targets = sent.map((m) => m.to);
    expect(targets).toContain('ExponentPushToken[desk]');
    expect(targets).not.toContain('ExponentPushToken[other]');
  });

  it('can be narrowed to one product', async () => {
    // A scribe-only event must not buzz the front desk's phone.
    pushToClinic('c1', { title: 'x', body: 'y' }, ['mediscribe']);
    await flush();
    expect(sent.map((m) => m.to)).toEqual(['ExponentPushToken[doc]']);
  });

  it('sends nothing at all when no device is registered', async () => {
    rows.length = 0;
    pushToClinic('c1', { title: 'x', body: 'y' });
    await flush();
    expect(sent).toEqual([]);
  });
});

describe('when delivery goes wrong', () => {
  beforeEach(() => {
    rows.push({ token: 'ExponentPushToken[gone]', clinicId: 'c1', userId: 'u1', product: 'clinicbook' });
  });

  it('deletes a token Expo says is no longer registered', async () => {
    // Uninstalled app, or a rotated token. Retrying it forever is how a push
    // queue fills with garbage nobody notices.
    expoResponse = {
      ok: true,
      body: { data: [{ status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } }] }
    };
    pushToClinic('c1', { title: 'x', body: 'y' });
    await flush();
    expect(deleted.flat()).toEqual(['ExponentPushToken[gone]']);
  });

  it('keeps a token when the error is something else', async () => {
    // A transient Expo problem must not cost the clinic its device.
    expoResponse = {
      ok: true,
      body: { data: [{ status: 'error', message: 'rate limited', details: { error: 'MessageRateExceeded' } }] }
    };
    pushToClinic('c1', { title: 'x', body: 'y' });
    await flush();
    expect(deleted.flat()).toEqual([]);
  });

  it('never throws into the caller when Expo is down', async () => {
    // A booking must not fail because a phone is unreachable.
    vi.stubGlobal('fetch', async () => {
      throw new Error('network down');
    });
    expect(() => pushToClinic('c1', { title: 'x', body: 'y' })).not.toThrow();
    await flush();
  });
});
