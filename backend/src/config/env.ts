import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Resolves to backend/.env regardless of where the process is started from
dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: false });

// Parse a boolean-ish env var. Unlike z.coerce.boolean() (which treats the
// string "false" as true), this only treats the explicit truthy tokens as true,
// and falls back to `def` when unset/blank — so a flag left out of .env keeps
// the documented default.
const envBool = (def: boolean) =>
  z.preprocess((v) => {
    if (typeof v !== 'string') return def;
    const s = v.trim().toLowerCase();
    if (s === '') return def;
    return ['1', 'true', 'yes', 'on'].includes(s);
  }, z.boolean());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGIN: z.string().default('*'),
  // Public base URL the backend is reachable at (tunnel / Railway domain), e.g.
  // https://clinicbook.up.railway.app. Used to print + report the WhatsApp
  // webhook URL. Optional: falls back to http://localhost:PORT when unset.
  PUBLIC_BASE_URL: z.string().optional(),
  WHATSAPP_TOKEN: z.string().optional(),
  PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),
  VERIFY_TOKEN: z.string().optional(),
  // Meta App Secret for inbound webhook signature verification.
  // Trimmed: a stray trailing newline/space (common when pasting into a host's
  // dashboard) would otherwise break HMAC signature comparison.
  WHATSAPP_APP_SECRET: z.string().trim().optional(),
  // The clinic that owns the configured WhatsApp number. All inbound patient
  // messages are bound to this clinic (booking, onboarding, dashboard). When a
  // clinic later gets its own number, map metadata.phone_number_id → clinic here.
  // Trimmed: a trailing newline/space would make the clinic lookup-by-id miss.
  WHATSAPP_CLINIC_ID: z.string().trim().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_ID: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  // --- WhatsApp AI Receptionist feature flags ------------------------------
  // All default OFF so the live deterministic FSM booking line is unchanged
  // until these are explicitly enabled.
  //
  // WA_AI_RECEPTIONIST: turn on the AI natural-language understanding layer in
  //   front of the FSM (intent/speciality/date/doctor extraction, FAQs, returning-
  //   patient memory, confidence-based clarify/handoff). Needs OPENAI_API_KEY;
  //   falls back to the deterministic keyword classifier when off or unkeyed.
  // WA_INTERACTIVE: render replies as WhatsApp interactive buttons / list
  //   messages instead of numbered plain text.
  // WA_AI_CONFIDENCE_MIN: below this score the receptionist asks the patient to
  //   clarify (or offers a human) instead of guessing an intent.
  WA_AI_RECEPTIONIST: envBool(false),
  WA_INTERACTIVE: envBool(false),
  WA_AI_CONFIDENCE_MIN: z.coerce.number().min(0).max(1).default(0.6),
  // Voice notes: patients can send a WhatsApp voice message; it is transcribed
  // (OpenAI Whisper) and routed through AI understanding even when
  // WA_AI_RECEPTIONIST is off for text. Needs OPENAI_API_KEY. Values: blank or
  // "*"/"all" → everyone (default ON); comma-separated numbers (last-10 match)
  // → only those; "off" → disabled.
  WA_VOICE_TEST_NUMBERS: z.string().default('')
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const issues = parsedEnv.error.issues.map((issue: { message: string }) => issue.message).join('; ');
  throw new Error(`Invalid environment configuration: ${issues}`);
}

// Refuse to boot with a known placeholder/default JWT secret — a forgeable
// signing key would let anyone mint admin tokens for any clinic.
const FORBIDDEN_JWT_SECRETS = new Set([
  'replace-with-a-long-random-secret',
  'change-me',
  'secret',
  'your-secret-key'
]);
if (FORBIDDEN_JWT_SECRETS.has(parsedEnv.data.JWT_SECRET)) {
  throw new Error(
    'JWT_SECRET is set to a known placeholder value. Generate a strong unique secret ' +
      "(e.g. `node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"`) and set it in backend/.env."
  );
}

// Refuse to boot with a wildcard CORS origin in production. The app sends
// `credentials: true`, and a wildcard origin (`*` / reflect-any) combined with
// credentials is both rejected by browsers and a security hole (any site could
// make credentialed cross-origin calls). Production must pin an explicit
// allowlist of frontend origins.
if (parsedEnv.data.NODE_ENV === 'production' && parsedEnv.data.CORS_ORIGIN.trim() === '*') {
  throw new Error(
    'CORS_ORIGIN must not be "*" in production. Set it to your deployed frontend URL ' +
      '(comma-separated for multiple origins), e.g. https://app.yourclinic.com'
  );
}

export const env = parsedEnv.data;
