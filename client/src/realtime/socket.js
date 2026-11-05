// client/src/realtime/socket.js
import { io } from 'socket.io-client';
import { tokenStore } from '../api/client.js';

/** The token travels in the handshake, never in the URL. */
export const connectSocket = () =>
  io({ auth: { token: tokenStore.get() }, transports: ['websocket'], reconnectionDelayMax: 10000 });
