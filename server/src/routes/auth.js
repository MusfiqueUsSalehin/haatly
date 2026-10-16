import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { loginSchema, registerSchema } from '../schemas/auth.js';
import { registerUser, verifyCredentials } from '../services/userService.js';
import { AppError } from '../utils/AppError.js';

export function createAuthRouter({ env, tokens }) {
  const router = Router();

  // Only failed attempts count, which slows password guessing without punishing real users.
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: env.AUTH_RATE_LIMIT_MAX,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(new AppError(429, 'rate_limited', 'Too many attempts. Please try again later.')),
  });

  router.post('/register', limiter, validate(registerSchema), async (req, res) => {
    const user = await registerUser(req.valid.body);
    res.status(201).json({ user, token: tokens.sign(user) });
  });

  router.post('/login', limiter, validate(loginSchema), async (req, res) => {
    const { email, password } = req.valid.body;
    const user = await verifyCredentials(email, password);
    res.json({ user, token: tokens.sign(user) });
  });

  // Open to pending accounts on purpose, so they can see that they are waiting for approval.
  router.get('/me', authenticate(tokens), (req, res) => {
    res.json({ user: req.user });
  });

  return router;
}
