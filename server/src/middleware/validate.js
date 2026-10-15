import { AppError } from '../utils/AppError.js';

/**
 * Validate req.body (default), req.query or req.params against a zod schema.
 * The cleaned, typed result is stored on req.valid[source]; handlers must read from
 * there, never from the raw request, so unknown fields can never sneak through.
 */
export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join('.') || '_';
        details[key] ??= issue.message;
      }
      return next(new AppError(400, 'validation_error', 'Validation failed', details));
    }
    req.valid = { ...req.valid, [source]: result.data };
    next();
  };
}
