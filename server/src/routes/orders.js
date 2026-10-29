import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { Order } from '../models/Order.js';
import {
  cancelOrderSchema,
  listOrdersQuery,
  orderCodeParams,
  placeOrderSchema,
} from '../schemas/orders.js';
import { cancelOrder } from '../services/orders/cancelOrder.js';
import { describeOrder } from '../services/orders/describeOrder.js';
import { checkout } from '../services/orders/placeOrder.js';
import { describePayment } from '../services/payments/describePayment.js';
import { AppError } from '../utils/AppError.js';

/** Customer routes: place orders and follow their own. */
export function createOrdersRouter({
  tokens,
  otpSecret,
  provider = null,
  paymentWindowMinutes = 15,
  perUserPerHour = 20,
}) {
  const router = Router();

  router.use(authenticate(tokens), requireRole('customer'));

  const limiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: perUserPerHour,
    keyGenerator: (req) => String(req.user._id),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(new AppError(429, 'rate_limited', 'Too many orders this hour. Please try later.')),
  });

  router.post('/', limiter, validate(placeOrderSchema), async (req, res) => {
    const { order, payment, payUrl } = await checkout({
      customer: req.user,
      body: req.valid.body,
      provider,
      paymentWindowMinutes,
    });
    res.status(201).json({
      order: describeOrder(order, { otpSecret }),
      payment: describePayment(payment, payUrl),
    });
  });

  // The list never includes delivery codes: only the detail view does.
  router.get('/', validate(listOrdersQuery, 'query'), async (req, res) => {
    const { status, page, limit } = req.valid.query;
    const filter = { customer: req.user._id, ...(status && { status }) };
    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Order.countDocuments(filter),
    ]);
    res.json({ orders: orders.map((order) => describeOrder(order)), page, limit, total });
  });

  // Someone else's order looks exactly like an order that does not exist.
  router.get('/:code', validate(orderCodeParams, 'params'), async (req, res) => {
    const order = await Order.findOne({
      code: req.valid.params.code,
      customer: req.user._id,
    }).select('+otpSalt');
    if (!order) throw new AppError(404, 'order_not_found', 'Order not found');
    res.json({ order: describeOrder(order, { otpSecret }) });
  });

  router.post(
    '/:code/cancel',
    validate(orderCodeParams, 'params'),
    validate(cancelOrderSchema),
    async (req, res) => {
      const order = await cancelOrder({
        customer: req.user,
        code: req.valid.params.code,
        reason: req.valid.body.reason,
        provider,
      });
      res.json({ order: describeOrder(order) });
    },
  );

  return router;
}
