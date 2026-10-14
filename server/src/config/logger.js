import pino from 'pino';

export function createLogger(env) {
  const pretty = env.NODE_ENV === 'development';
  return pino({
    level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
    redact: ['req.headers.authorization', 'req.headers.cookie'],
    ...(pretty && { transport: { target: 'pino-pretty', options: { colorize: true } } }),
  });
}
