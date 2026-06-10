import { AxiosResponse } from 'axios';

import { getWhatsAppApiClient, getWhatsAppPhoneNumberId } from '../../config/whatsapp.js';
import { WhatsAppTextMessageInput } from './whatsapp.types.js';

interface WhatsAppSendMessageResponse {
  messaging_product?: string;
  contacts?: Array<{ input?: string; wa_id?: string }>;
  messages?: Array<{ id?: string }>;
}

export const sendWhatsAppTextMessage = async (
  input: WhatsAppTextMessageInput
): Promise<AxiosResponse<WhatsAppSendMessageResponse>> => {
  const phoneNumberId = getWhatsAppPhoneNumberId();
  const client = getWhatsAppApiClient();

  return client.post(`/${phoneNumberId}/messages`, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: input.to,
    type: 'text',
    text: {
      preview_url: input.previewUrl ?? false,
      body: input.body
    }
  });
};

export const exampleSendMessageFunction = async () => {
  return sendWhatsAppTextMessage({
    to: '15551234567',
    body: 'Hello from ClinicBook AI. Your appointment is confirmed.'
  });
};