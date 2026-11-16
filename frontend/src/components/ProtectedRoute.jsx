import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Requires authentication and optionally one of the given roles and/or
 * one of the given permission codes (`perm` may be a string or an array).
 */
export default function ProtectedRoute({ roles, perm, children }) {
  const { isAuthenticated, user, can } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  if (roles && roles.length && (!user || !roles.includes(user.role))) {
    return <Navigate to="/" replace />;
  }
  if (perm) {
    const codes = Array.isArray(perm) ? perm : [perm];
    if (!codes.some((code) => can(code))) return <Navigate to="/" replace />;
  }
  return children;
}
