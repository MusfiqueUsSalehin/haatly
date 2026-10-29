import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { Payment } from '../models/Payment.js';
import { sandboxCompleteSchema } from '../schemas/payments.js';
import { handleWebhook } from '../services/payments/webhook.js';
import { AppError } from '../utils/AppError.js';

export function createPaymentsRouter({ env, tokens, provider }) {
  const router = Router();
  const secret = env.PAYMENT_WEBHOOK_SECRET;

  // The gateway calls this. It has no login: the signature over the raw body is the proof.
  // (app.js hands this route the raw bytes instead of parsed JSON.)
  router.post('/webhook', async (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    const result = await handleWebhook({
      rawBody,
      timestamp: req.get('x-haatly-timestamp'),
      signature: req.get('x-haatly-signature'),
      secret,
      provider,
    });
    res.json({ received: true, ...result });
  });

  // Development only. The sandbox provider is refused in production, so this route can
  // never exist there. It lets a customer "pay" or "fail" their own sandbox payment by
  // sending the same signed event a real gateway would.
  if (provider?.name === 'sandbox') {
    router.post(
      '/sandbox/complete',
      authenticate(tokens),
      requireRole('customer'),
      validate(sandboxCompleteSchema),
      async (req, res) => {
        const { providerRef, outcome } = req.valid.body;
        const payment = await Payment.findOne({ providerRef, customer: req.user._id });
        if (!payment) throw new AppError(404, 'payment_not_found', 'Payment not found');

        const event = provider.buildEvent({
          providerRef,
          orderCode: payment.orderCode,
          amountBdt: payment.amountBdt,
          outcome,
        });
        const result = await handleWebhook({
          rawBody: event.rawBody,
          timestamp: event.headers['x-haatly-timestamp'],
          signature: event.headers['x-haatly-signature'],
          secret,
          provider,
        });
        res.json({ result });
      },
    );
  }

  return router;
}
