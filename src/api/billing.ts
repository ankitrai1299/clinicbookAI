import { apiFetch } from './client';

export const getBillingStatus = () =>
  apiFetch<{ configured: boolean }>('/api/billing/status');

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
