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
  WHATSAPP_TOKEN: z.string().optional(),
  PHONE_NUMBER_ID: z.string().optional(),
  VERIFY_TOKEN: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional()
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const issues = parsedEnv.error.issues.map((issue: { message: string }) => issue.message).join('; ');
  throw new Error(`Invalid environment configuration: ${issues}`);
}

export const env = parsedEnv.data;
