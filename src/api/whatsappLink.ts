import { apiFetch } from './client';

export interface WhatsAppLink {
  joinCode: string;
  sharedNumber: string | null;
  prefillText: string;
  link: string | null;
  instruction: string;
}

// The clinic's shareable WhatsApp join link + code (shared-number onboarding).
export const getWhatsAppLink = () => apiFetch<WhatsAppLink>('/api/clinics/whatsapp-link');
