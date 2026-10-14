import { AppError } from '../utils/AppError.js';

function toClientError(err) {
  if (err instanceof AppError) {
    return { status: err.status, code: err.code, message: err.message, details: err.details };
  }
  if (err.type === 'entity.parse.failed') {
    return { status: 400, code: 'invalid_json', message: 'Request body is not valid JSON' };
  }
  if (err.type === 'entity.too.large') {
    return { status: 413, code: 'payload_too_large', message: 'Request body is too large' };
  }
  if (err.name === 'ValidationError' && err.errors) {
    const details = Object.fromEntries(
      Object.entries(err.errors).map(([path, e]) => [path, e.message]),
    );
    return { status: 400, code: 'validation_error', message: 'Validation failed', details };
  }
  if (err.name === 'CastError') {
    return { status: 400, code: 'invalid_value', message: `Invalid value for "${err.path}"` };
  }
  // Anything else is a bug. Never leak its message to the client.
  return { status: 500, code: 'internal_error', message: 'Something went wrong' };
}

export function errorHandler(logger) {
  // Express identifies error handlers by their four parameters.
  return (err, req, res, next) => {
    if (res.headersSent) return next(err);
    const { status, code, message, details } = toClientError(err);
    if (status >= 500) logger.error({ err, method: req.method, url: req.originalUrl }, code);
    res.status(status).json({ error: { code, message, ...(details && { details }) } });
  };
}
