import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Resolves to backend/.env regardless of where the process is started from
dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: false });

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
  WHATSAPP_APP_SECRET: z.string().optional(),
  // The clinic that owns the configured WhatsApp number. All inbound patient
  // messages are bound to this clinic (booking, onboarding, dashboard). When a
  // clinic later gets its own number, map metadata.phone_number_id → clinic here.
  WHATSAPP_CLINIC_ID: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_ID: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),
  OPENAI_API_KEY: z.string().optional()
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

export const env = parsedEnv.data;
