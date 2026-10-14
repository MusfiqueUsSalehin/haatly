import { z } from 'zod';

export class EnvError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EnvError';
  }
}

const schema = z.object({
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
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
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
