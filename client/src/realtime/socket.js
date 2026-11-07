import { io } from 'socket.io-client';
import { tokenStore } from '../api/client.js';

// Same origin in development (proxied); the API origin in production.
const SOCKET_ORIGIN = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '') || undefined;

/** The token travels in the handshake, never in the URL. */
export const connectSocket = () =>
  io(SOCKET_ORIGIN, {
    auth: { token: tokenStore.get() },
    transports: ['websocket'],
    reconnectionDelayMax: 10000,
  });
