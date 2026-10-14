import { AppError } from '../utils/AppError.js';

export function notFound(req, _res, next) {
  next(new AppError(404, 'not_found', `Route not found: ${req.method} ${req.path}`));
}
