import { createServer } from 'node:http';
import { io as connect } from 'socket.io-client';
import { createRealtime } from '../../src/realtime/server.js';
import { makeTestApp, makeTestEnv } from './testApp.js';

/** Start the real app plus Socket.IO on a free port. Returns helpers to connect clients. */
export async function startRealtime() {
  const env = makeTestEnv();
  const httpServer = createServer(makeTestApp());
  const realtime = createRealtime({
    httpServer,
    env,
    logger: { error() {}, warn() {}, info() {} },
  });
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${httpServer.address().port}`;
  const clients = [];

  /** Connect with a token. Resolves when connected, rejects with the server's error. */
  const connectAs = (token) =>
    new Promise((resolve, reject) => {
      const socket = connect(url, {
        auth: { token },
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
      });
      clients.push(socket);
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', reject);
    });

  return {
    realtime,
    connectAs,
    async stop() {
      for (const socket of clients) socket.disconnect();
      await realtime.close();
    },
  };
}

/** Send an event and wait for the server's acknowledgement. */
export const emitWithAck = (socket, event, payload) =>
  socket.timeout(3000).emitWithAck(event, payload);

/** Resolve with the next `event` the socket receives, or fail after `ms`. */
export const waitFor = (socket, event, ms = 3000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no "${event}" within ${ms} ms`)), ms);
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });

/** Resolve after `ms` if the socket receives no `event`; fail if it does. */
export const expectNothing = (socket, event, ms = 300) =>
  new Promise((resolve, reject) => {
    const handler = () => reject(new Error(`unexpected "${event}"`));
    socket.once(event, handler);
    setTimeout(() => {
      socket.off(event, handler);
      resolve();
    }, ms);
  });
