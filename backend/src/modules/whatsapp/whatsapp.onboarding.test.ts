import { describe, it, expect } from 'vitest';
import type { AxiosInstance } from 'axios';

// validateWebhookSubscription takes the Graph client as a param, so it is
// testable with a stub — no network, no DB (import without a .js extension so
// Vite resolves the .ts source).
import { validateWebhookSubscription } from './whatsapp.onboarding';

// Minimal Axios stub: only the get/post used by the function.
const stub = (impl: { get?: () => Promise<unknown>; post?: () => Promise<unknown> }): AxiosInstance =>
  ({
    get: impl.get ?? (async () => ({ data: {} })),
    post: impl.post ?? (async () => ({ data: { success: true } }))
  }) as unknown as AxiosInstance;

const subscribed = stub({ get: async () => ({ data: { data: [{ id: 'app' }] } }) });
const notSubscribed = stub({ get: async () => ({ data: { data: [] } }) });

describe('validateWebhookSubscription — webhook config validation', () => {
  it('reports already-subscribed without attempting a subscribe', async () => {
    const r = await validateWebhookSubscription(subscribed, 'waba1', true);
    expect(r).toMatchObject({ subscribed: true, attemptedSubscribe: false });
  });

  it('auto-subscribes when not subscribed and subscribe=true', async () => {
    const r = await validateWebhookSubscription(notSubscribed, 'waba1', true);
    expect(r).toMatchObject({ subscribed: true, attemptedSubscribe: true });
  });

  it('reports the gap (no subscribe) when subscribe=false', async () => {
    const r = await validateWebhookSubscription(notSubscribed, 'waba1', false);
    expect(r).toMatchObject({ subscribed: false, attemptedSubscribe: false });
    expect(r.detail).toMatch(/not subscribed/i);
  });

  it('does not throw when the subscription cannot be read', async () => {
    const unreadable = stub({
      get: async () => {
        throw { response: { data: { error: { message: 'permission denied' } } } };
      }
    });
    const r = await validateWebhookSubscription(unreadable, 'waba1', true);
    expect(r).toMatchObject({ subscribed: false, attemptedSubscribe: false });
    expect(r.detail).toMatch(/permission denied/);
  });

  it('reports a failed auto-subscribe instead of throwing', async () => {
    const postFails = stub({
      get: async () => ({ data: { data: [] } }),
      post: async () => {
        throw { response: { data: { error: { message: 'cannot subscribe' } } } };
      }
    });
    const r = await validateWebhookSubscription(postFails, 'waba1', true);
    expect(r).toMatchObject({ subscribed: false, attemptedSubscribe: true });
    expect(r.detail).toMatch(/cannot subscribe/);
  });
});
