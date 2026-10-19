import { z } from 'zod';

export class EnvError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EnvError';
  }
}

// Secrets that look copied from an example file must never reach production.
const PLACEHOLDER_SECRET = /change[-_]?me|example|dev[-_]?only|your[-_]?secret/i;

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(5000),
    MONGODB_URI: z
      .string()
      .regex(/^mongodb(\+srv)?:\/\/.+/, 'must start with mongodb:// or mongodb+srv://'),
    CLIENT_ORIGINS: z
      .string()
      .default('http://localhost:5173')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      )
      .refine((origins) => origins.length > 0 && origins.every((o) => URL.canParse(o)), {
        message: 'must be a comma-separated list of full URLs, e.g. http://localhost:5173',
      }),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
    JWT_EXPIRES_IN: z
      .string()
      .regex(/^\d+[smhd]$/, 'must look like 30m, 12h or 7d')
      .default('7d'),
    // How many reverse proxies sit in front of the app (0 when running directly).
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
    // Failed login/register attempts allowed per IP per 15 minutes.
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(20),

    // AI features always work without a provider (rules only). Set AI_PROVIDER=anthropic
    // and an API key to let a model improve the answers.
    AI_PROVIDER: z.enum(['none', 'anthropic']).default('none'),
    ANTHROPIC_API_KEY: z
      .string()
      .optional()
      .transform((value) => value?.trim() || undefined),
    AI_MODEL: z.string().trim().min(1).default('claude-haiku-5-5'),
    AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(15000),
    // Hard cap on model calls per rolling 24 hours. Past it, the rules answer instead.
    AI_MAX_CALLS_PER_DAY: z.coerce.number().int().min(0).default(500),
  })
  .refine((env) => !(env.NODE_ENV === 'production' && PLACEHOLDER_SECRET.test(env.JWT_SECRET)), {
    path: ['JWT_SECRET'],
    message: 'looks like a placeholder; generate a real secret before running in production',
  })
  .refine((env) => env.AI_PROVIDER !== 'anthropic' || Boolean(env.ANTHROPIC_API_KEY), {
    path: ['ANTHROPIC_API_KEY'],
    message: 'is required when AI_PROVIDER is anthropic',
  });

/**
 * Validate raw environment variables and return a frozen config object.
 * Throws EnvError listing every problem, so a bad deploy fails at boot, not at 3am.
 */
export function parseEnv(source) {
  const result = schema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map(
      (issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    throw new EnvError(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  return Object.freeze(result.data);
}
