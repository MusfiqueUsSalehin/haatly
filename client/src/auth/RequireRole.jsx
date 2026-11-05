// client/src/auth/RequireRole.jsx

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import { HOME_FOR_ROLE, ROUTES } from '../routes.js';

/** <RequireRole> = signed in; <RequireRole roles={['farmer']}> = specific roles. */
export default function RequireRole({ roles, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <p className="p-8 text-center">…</p>;
  if (!user) return <Navigate to={ROUTES.login} state={{ from: location }} replace />;
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={HOME_FOR_ROLE[user.role]} replace />;
  }
  return children;
}
