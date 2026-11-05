// client/src/realtime/useSocket.js
import { useEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { connectSocket } from './socket.js';

/**
 * Connects while signed in. `handlers` maps event name -> function. The set of event
 * names must stay the same between renders; the functions can change freely.
 * Returns a ref to the live socket (null until connected).
 */
export function useSocket(handlers) {
  const { user } = useAuth();
  const socketRef = useRef(null);
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    if (!user) return undefined;
    const socket = connectSocket();
    socketRef.current = socket;
    for (const name of Object.keys(latest.current)) {
      socket.on(name, (...args) => latest.current[name]?.(...args));
    }
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  return socketRef;
}
