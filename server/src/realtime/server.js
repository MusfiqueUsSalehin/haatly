import { Server } from 'socket.io';
import { RUN_STATUS, STOP_STATUS } from '../constants/dispatch.js';
import { ORDER_CODE_PATTERN } from '../constants/orders.js';
import { Order } from '../models/Order.js';
import { Run } from '../models/Run.js';
import { User } from '../models/User.js';
import { createTokenService } from '../services/tokenService.js';
import { SocketAuthError, authenticateHandshake, msUntil } from './auth.js';
import { createRateGate, createWindowLimiter, parseLocation } from './location.js';
import { MAX_ORDER_SUBSCRIPTIONS, canSubscribeToOrder, roomsForUser } from './policy.js';

import { subscribe } from './events.js';
import { routeEvent } from './routing.js';
import { rooms } from './rooms.js';

const LOCATION_MIN_INTERVAL_MS = 2000;
const REQUESTS_PER_MINUTE = 30;

/**
 * Live updates over Socket.IO. Nobody connects without a valid session, nobody joins a
 * room they are not allowed in, and a rider's location only reaches the customers whose
 * stop is still ahead of them.
 */
export function createRealtime({ httpServer, env, logger, tokens = createTokenService(env) }) {
  const io = new Server(httpServer, {
    serveClient: false,
    maxHttpBufferSize: 10_000,
    cors: { origin: env.CLIENT_ORIGINS, credentials: true },
  });

  // Every connection must prove who it is first. The token travels in the handshake, not
  // in the URL (URLs end up in logs).
  io.use(async (socket, next) => {
    try {
      const { user, expiresAt } = await authenticateHandshake({
        token: socket.handshake.auth?.token,
        tokens,
        findUser: (id) => User.findById(id),
      });
      socket.data.user = user;
      socket.data.expiresAt = expiresAt;
      next();
    } catch (err) {
      if (err instanceof SocketAuthError) {
        next(Object.assign(new Error(err.message), { data: { code: err.code } }));
      } else {
        logger.error({ err }, 'socket authentication failed');
        next(Object.assign(new Error('Service unavailable'), { data: { code: 'unavailable' } }));
      }
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    for (const room of roomsForUser(user)) socket.join(room);

    // A session ends when its token does.
    const ttl = msUntil(socket.data.expiresAt);
    const expiry =
      ttl === null
        ? null
        : setTimeout(() => {
            socket.emit('session:expired');
            socket.disconnect(true);
          }, ttl);
    socket.on('disconnect', () => clearTimeout(expiry));

    const subscriptions = new Set();
    const requestLimiter = createWindowLimiter({ max: REQUESTS_PER_MINUTE, windowMs: 60_000 });
    const locationGate = createRateGate({ minIntervalMs: LOCATION_MIN_INTERVAL_MS });
    const reply = (ack, body) => {
      if (typeof ack === 'function') ack(body);
    };

    socket.on('order:subscribe', async (payload, ack) => {
      try {
        if (!requestLimiter.allow()) return reply(ack, { ok: false, error: 'too_many_requests' });

        const code = payload?.orderCode;
        if (typeof code !== 'string' || !ORDER_CODE_PATTERN.test(code)) {
          return reply(ack, { ok: false, error: 'invalid_order_code' });
        }
        if (!subscriptions.has(code) && subscriptions.size >= MAX_ORDER_SUBSCRIPTIONS) {
          return reply(ack, { ok: false, error: 'too_many_subscriptions' });
        }

        // Look the user up again, so a suspension takes effect on an open connection.
        const [order, fresh] = await Promise.all([
          Order.findOne({ code }).select('customer').lean(),
          User.findById(user._id),
        ]);
        // "Not yours" and "does not exist" look exactly the same, so codes cannot be probed.
        if (!canSubscribeToOrder(fresh, order))
          return reply(ack, { ok: false, error: 'not_found' });

        socket.join(rooms.order(code));
        subscriptions.add(code);
        reply(ack, { ok: true });
      } catch (err) {
        logger.error({ err }, 'order:subscribe failed');
        reply(ack, { ok: false, error: 'server_error' });
      }
    });

    socket.on('order:unsubscribe', (payload, ack) => {
      const code = payload?.orderCode;
      if (typeof code === 'string' && subscriptions.delete(code)) socket.leave(rooms.order(code));
      reply(ack, { ok: true });
    });

    socket.on('rider:location', async (payload, ack) => {
      try {
        if (user.role !== 'rider') return reply(ack, { ok: false, error: 'forbidden' });
        if (!locationGate.allow()) return reply(ack, { ok: false, error: 'too_fast' });

        const parsed = parseLocation(payload);
        if (!parsed.ok) return reply(ack, { ok: false, error: 'invalid_location' });

        const fresh = await User.findById(user._id);
        if (!fresh || fresh.status !== 'active')
          return reply(ack, { ok: false, error: 'forbidden' });

        const run = await Run.findOne({ rider: user._id, status: RUN_STATUS.IN_PROGRESS }).lean();
        if (!run) return reply(ack, { ok: false, error: 'no_active_run' });

        // Customers only see the rider while their own stop is still to come.
        const pending = run.stops.filter((stop) => stop.status === STOP_STATUS.PENDING);
        for (const stop of pending) {
          io.to(rooms.order(stop.orderCode)).emit('rider:location', {
            orderCode: stop.orderCode,
            ...parsed.location,
          });
        }
        io.to(rooms.admin).emit('run:location', {
          runCode: run.code,
          riderId: String(user._id),
          ...parsed.location,
        });
        reply(ack, { ok: true, deliveredTo: pending.length });
      } catch (err) {
        logger.error({ err }, 'rider:location failed');
        reply(ack, { ok: false, error: 'server_error' });
      }
    });
  });

  // Domain events (order placed, payment confirmed, stop delivered...) fan out to the right rooms.
  const stopListening = subscribe((type, data) => {
    for (const { room, event, payload } of routeEvent(type, data)) io.to(room).emit(event, payload);
  });

  return {
    io,
    emitToOrder: (orderCode, event, payload) => io.to(rooms.order(orderCode)).emit(event, payload),
    emitToUser: (userId, event, payload) => io.to(rooms.user(userId)).emit(event, payload),
    emitToAdmins: (event, payload) => io.to(rooms.admin).emit(event, payload),
    /** Disconnects everyone and closes the HTTP server too. */
    close: () => {
      stopListening();
      return new Promise((resolve) => io.close(() => resolve()));
    },
  };
}
