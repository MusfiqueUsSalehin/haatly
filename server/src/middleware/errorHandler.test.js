import { describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { AppError } from '../../src/utils/AppError.js';

function run(err) {
  const logger = { error: vi.fn() };
  const res = {
    headersSent: false,
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  const next = vi.fn();
  errorHandler(logger)(err, { method: 'GET', originalUrl: '/x' }, res, next);
  return { logger, res, next };
}

describe('errorHandler', () => {
  it('returns AppError details to the client', () => {
    const { res, logger } = run(new AppError(409, 'conflict', 'Already exists', { field: 'x' }));
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'conflict', message: 'Already exists', details: { field: 'x' } },
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('hides the message of unexpected errors and logs them', () => {
    const { res, logger } = run(new Error('secret db password leaked'));
    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body.error.code).toBe('internal_error');
    expect(JSON.stringify(body)).not.toContain('secret');
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it('maps mongoose validation errors to 400', () => {
    const err = Object.assign(new Error('v'), {
      name: 'ValidationError',
      errors: { price: { message: 'price is required' } },
    });
    const { res } = run(err);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error.details).toEqual({ price: 'price is required' });
  });

  it('maps mongoose cast errors to 400', () => {
    const { res } = run(Object.assign(new Error('c'), { name: 'CastError', path: '_id' }));
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('passes the error on when headers were already sent', () => {
    const logger = { error: vi.fn() };
    const res = { headersSent: true };
    const next = vi.fn();
    const err = new Error('late');
    errorHandler(logger)(err, {}, res, next);
    expect(next).toHaveBeenCalledWith(err);
  });
});
