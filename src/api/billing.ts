import { apiFetch } from './client';

export const getBillingStatus = () =>
  apiFetch<{ configured: boolean; razorpay?: boolean; stripe?: boolean }>('/api/billing/status');

/**
 * Start a Razorpay subscription and return the page the clinic pays on.
 *
 * No success or cancel URL, unlike Stripe's checkout: reaching a success page
 * proves only that a browser followed a redirect. Access is granted by the
 * signed webhook, which is the only thing that knows money actually moved.
 */
export const startSubscription = () =>
  apiFetch<{ url: string }>('/api/billing/subscribe', { method: 'POST' });

export const stopSubscription = () =>
  apiFetch<void>('/api/billing/unsubscribe', { method: 'POST' });

export const createCheckoutSession = (successUrl: string, cancelUrl: string) =>
  apiFetch<{ url: string }>('/api/billing/checkout-session', {
    method: 'POST',
    body: JSON.stringify({ successUrl, cancelUrl }),
  });

export const createPortalSession = (returnUrl: string) =>
  apiFetch<{ url: string }>('/api/billing/portal-session', {
    method: 'POST',
    body: JSON.stringify({ returnUrl }),
  });
