import { apiFetch } from './client';

/** The two products. Keys, not names — they are stored per clinic and in links. */
export type ProductKey = 'clinicbook' | 'mediscribe';

export interface ApiClinic {
  id: string;
  name: string;
  email: string;
  phone: string;
  plan: string;
  stripeCustomerId?: string;
  /**
   * What this clinic bought.
   *
   * Optional because a backend that predates it sends nothing, and an app build
   * already in someone's pocket must keep working against one. Read it through
   * `ownsProduct`, which treats "did not say" as "has everything" — the same
   * answer the server gives when its own lookup fails, so the two cannot
   * disagree and quietly hide a product a clinic is paying for.
   */
  products?: ProductKey[];
}

/** Does this clinic have the product? Unknown means yes — see above. */
export const ownsProduct = (clinic: ApiClinic | null | undefined, product: ProductKey): boolean =>
  !clinic?.products ? true : clinic.products.includes(product);

export const getMyClinic = () => apiFetch<ApiClinic>('/api/clinics/me');

export const updateMyClinic = (body: { name?: string; phone?: string }) =>
  apiFetch<ApiClinic>('/api/clinics/me', { method: 'PATCH', body: JSON.stringify(body) });
