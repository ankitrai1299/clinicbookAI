/**
 * Registers the ClinicBook message templates on the PLATFORM's WhatsApp Business
 * Account (the env-configured default channel). Templates must be APPROVED by
 * Meta before they can be sent; test numbers usually auto-approve UTILITY
 * templates within minutes. Re-running is safe — Meta rejects a duplicate name,
 * which this script reports and skips.
 *
 *   Run:  npx tsx scripts/registerWhatsAppTemplates.ts
 *
 * NOTE: clinics that connect their OWN number via Embedded Signup get their own
 * WABA, and this script does not touch it. Their templates are submitted
 * automatically during onboarding by src/core/whatsapp/whatsapp.provisioning.ts,
 * which reads the same definitions imported below — so the two paths can never
 * drift.
 */
import path from 'path';
import { fileURLToPath } from 'url';

import axios from 'axios';
import dotenv from 'dotenv';

import {
  TEMPLATE_DEFINITIONS,
  TEMPLATE_LANGUAGE,
  TemplateDefinition,
  templateCreatePayload
} from '../src/core/whatsapp/whatsapp.templateDefs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const TOKEN = process.env.WHATSAPP_TOKEN;
const WABA_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
const GRAPH = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION ?? 'v20.0'}`;

if (!TOKEN || !WABA_ID) {
  console.error('Missing WHATSAPP_TOKEN or WHATSAPP_BUSINESS_ACCOUNT_ID in backend/.env');
  process.exit(1);
}

const register = async (tpl: TemplateDefinition) => {
  try {
    const { data } = await axios.post(
      `${GRAPH}/${WABA_ID}/message_templates`,
      templateCreatePayload(tpl, TEMPLATE_LANGUAGE),
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

for (const tpl of TEMPLATE_DEFINITIONS) {
  await register(tpl);
}

console.log('\nDone. Check approval status in the Meta WhatsApp Manager → Message Templates.');
