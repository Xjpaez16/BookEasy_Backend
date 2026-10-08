import { z } from 'zod';

/**
 * Environment configuration validated with Zod.
 * Fails fast at boot if required variables are missing or malformed.
 * Never log the parsed secrets.
 */

/**
 * Coerces an empty string to `undefined` so a blank `.env` line (e.g.
 * `EMAIL_FROM=`) is treated as "not set" rather than failing an optional
 * `.url()` / `.email()` check. Env vars are always strings on the wire.
 */
/* eslint-disable @typescript-eslint/explicit-function-return-type --
   return types are inferred Zod schemas; annotating them fights preprocess's
   `unknown` input type. */
const optionalString = () =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().optional(),
  );
const optionalUrl = () =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().url().optional(),
  );
const optionalEmail = () =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().email().optional(),
  );
/* eslint-enable @typescript-eslint/explicit-function-return-type */

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url(),

  // Auth / crypto
  ACCESS_TOKEN_SECRET: z.string().min(32),
  REFRESH_TOKEN_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  // CORS allowlist (comma-separated origins)
  CORS_ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),

  // Cookies
  COOKIE_DOMAIN: optionalString(),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  // Notifications (optional for MVP boot)
  WHATSAPP_API_URL: optionalUrl(),
  WHATSAPP_API_TOKEN: optionalString(),
  WHATSAPP_PHONE_ID: optionalString(),
  EMAIL_FROM: optionalEmail(),
  SMTP_URL: optionalString(),
});

export type AppConfig = z.infer<typeof EnvSchema>;

let cached: AppConfig | null = null;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
