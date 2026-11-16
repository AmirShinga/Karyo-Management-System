import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import api from '../api/api';
import { BUILTIN_ROLES, ROLE_LABELS } from '../utils/roles';

const AuthContext = createContext(null);

function readPermissions() {
  try {
    return JSON.parse(localStorage.getItem('permissions')) || [];
  } catch {
    return [];
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('user')) || null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [permissions, setPermissions] = useState(readPermissions);
  const [roles, setRoles] = useState(BUILTIN_ROLES);

  const login = useCallback((nextToken, nextUser, nextPermissions = []) => {
    localStorage.setItem('token', nextToken);
    localStorage.setItem('user', JSON.stringify(nextUser));
    localStorage.setItem('permissions', JSON.stringify(nextPermissions));
    setToken(nextToken);
    setUser(nextUser);
    setPermissions(nextPermissions);
  }, []);

  const logout = useCallback(() => {
    // Revoke the refresh session server-side (fire and forget), then clear locally.
    api.post('/auth/logout', {}).catch(() => {});
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('permissions');
    setToken(null);
    setUser(null);
    setPermissions([]);
    setRoles(BUILTIN_ROLES);
  }, []);

  const applySession = useCallback((nextUser, nextPermissions) => {
    localStorage.setItem('user', JSON.stringify(nextUser));
    localStorage.setItem('permissions', JSON.stringify(nextPermissions));
    setUser(nextUser);
    setPermissions(nextPermissions);
  }, []);

  /** Re-reads the signed-in user and their permissions from the API. */
  const refresh = useCallback(async () => {
    if (!localStorage.getItem('token')) return;
    try {
      const res = await api.get('/auth/me');
      const { permissions: nextPermissions = [], ...nextUser } = res.data.data;
      applySession(nextUser, nextPermissions);
    } catch {
      // 401s are handled by the API interceptor.
    }
  }, [applySession]);

  /** Reloads the role list (after an admin creates a new role). */
  const refreshRoles = useCallback(async () => {
    if (!localStorage.getItem('token')) return;
    try {
      const res = await api.get('/roles');
      setRoles(res.data.data);
    } catch {
      // Keep the built-in role list if the request fails.
    }
  }, []);

  const roleLabel = useCallback(
    (role) => roles.find((item) => item.code === role)?.label || ROLE_LABELS[role] || role || '',
    [roles]
  );

  // Refresh the user + permission set on load.
  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/auth/me');
        const { permissions: nextPermissions = [], ...nextUser } = res.data.data;
        if (cancelled) return;
        applySession(nextUser, nextPermissions);
      } catch {
        // 401s are handled by the API interceptor.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, applySession]);

  // Load role labels for the signed-in user.
  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/roles');
        if (!cancelled) setRoles(res.data.data);
      } catch {
        // Keep the built-in role list if the request fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Keep multiple tabs in sync.
  useEffect(() => {
    const onStorage = () => {
      setToken(localStorage.getItem('token'));
      try {
        setUser(JSON.parse(localStorage.getItem('user')) || null);
      } catch {
        setUser(null);
      }
      setPermissions(readPermissions());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const value = {
    user,
    token,
    permissions,
    roles,
    isAuthenticated: !!token,
    hasRole: (...rolesArg) => !!user && rolesArg.includes(user.role),
    /** True if the signed-in user holds the permission. Admin always passes. */
    can: (code) => {
      if (!user) return false;
      if (user.role === 'admin') return true;
      return permissions.includes(code);
    },
    roleLabel,
    login,
    logout,
    refresh,
    refreshRoles,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
