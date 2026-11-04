// client/src/auth/AuthContext.jsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, post, setUnauthorizedHandler, tokenStore } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(tokenStore.get()));

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!tokenStore.get()) return;
    api('/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, [logout]);

  const accept = ({ user: u, token }) => {
    tokenStore.set(token);
    setUser(u);
    return u;
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      isActive: user?.status === 'active',
      login: async (email, password) => accept(await post('/auth/login', { email, password })),
      register: async (form) => accept(await post('/auth/register', form)),
      logout,
    }),
    [user, loading, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
