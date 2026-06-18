/**
 * One-off helper: registers the three ClinicBook message templates with the
 * WhatsApp Business Account via the Graph API. Templates must be APPROVED by
 * Meta before they can be sent (test numbers usually auto-approve UTILITY
 * templates within minutes). Re-running is safe — Meta returns an error if a
 * template name already exists, which this script reports and skips.
 *
 *   Run:  npx tsx scripts/registerWhatsAppTemplates.ts
 *
 * The {{n}} body placeholders here MUST stay in sync with the *Components
 * builders in src/modules/whatsapp/whatsapp.templates.ts.
 */
import path from 'path';
import { fileURLToPath } from 'url';

import axios from 'axios';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const TOKEN = process.env.WHATSAPP_TOKEN;
const WABA_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
const GRAPH = 'https://graph.facebook.com/v20.0';

if (!TOKEN || !WABA_ID) {
  console.error('Missing WHATSAPP_TOKEN or WHATSAPP_BUSINESS_ACCOUNT_ID in backend/.env');
  process.exit(1);
}

interface TemplateDefinition {
  name: string;
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
  bodyText: string;
  example: string[];
}

const templates: TemplateDefinition[] = [
  {
    name: 'appointment_reminder',
    category: 'UTILITY',
    bodyText:
      'Hi {{1}}, this is a reminder for your appointment on {{2}} at {{3}} with Dr. {{4}} at {{5}}. Please arrive 10 minutes early.',
    example: ['John', 'Monday, June 15, 2026', '10:00', 'Smith', 'City Health Clinic']
  },
  {
    name: 'booking_confirmation',
    category: 'UTILITY',
    bodyText:
      'Hi {{1}}, your appointment on {{2}} at {{3}} with Dr. {{4}} at {{5}} is confirmed. See you soon!',
    example: ['John', 'Monday, June 15, 2026', '10:00', 'Smith', 'City Health Clinic']
  },
  {
    name: 'waitlist_offer',
    category: 'UTILITY',
    bodyText:
      "Hi {{1}}, a slot has just opened up with Dr. {{2}} at {{3}}. Reply YES to claim it before it's gone.",
    example: ['John', 'Smith', 'City Health Clinic']
  },
  {
    name: 'patient_registration',
    category: 'UTILITY',
    bodyText:
      'Hi {{1}}, thank you for registering with {{2}}. Your details have been received and our team will reach out shortly to confirm your appointment. You can reply to this message anytime to chat with us.',
    example: ['John', 'City Health Clinic']
  },
  {
    name: 'registration_welcome',
    category: 'UTILITY',
    bodyText:
      'Hi {{1}},\n\nWelcome to {{2}}.\n\nYour registration has been completed successfully.\n\nPatient ID: {{3}}\n\nReply:\n1 - Book Appointment\n2 - My Appointments\n3 - Cancel Appointment\n4 - Reschedule Appointment',
    example: ['Asha Verma', 'Sunrise Medical Center', 'PT-7K4Q9D']
  }
];

const register = async (tpl: TemplateDefinition) => {
  try {
    const { data } = await axios.post(
      `${GRAPH}/${WABA_ID}/message_templates`,
      {
        name: tpl.name,
        language: 'en_US',
        category: tpl.category,
        components: [
          {
            type: 'BODY',
            text: tpl.bodyText,
            example: { body_text: [tpl.example] }
          }
        ]
      },
      { headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' } }
    );
    console.log(`✅ ${tpl.name}: created → id=${data.id ?? '?'} status=${data.status ?? '?'}`);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const err = error.response?.data?.error;
      console.log(`⚠️  ${tpl.name}: ${err?.message ?? error.message} (code ${err?.code ?? 'n/a'})`);
    } else {
      console.log(`⚠️  ${tpl.name}: ${(error as Error).message}`);
    }
  }
};

for (const tpl of templates) {
  await register(tpl);
}

console.log('\nDone. Check approval status in the Meta WhatsApp Manager → Message Templates.');
