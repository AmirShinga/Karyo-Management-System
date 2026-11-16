import axios from 'axios';

// Single source of truth for the API base URL.
// Production: set VITE_API_URL (e.g. https://hms-api.onrender.com/api)
// Dev default: http://localhost:5000/api
const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

export const API_ORIGIN = baseURL.replace(/\/api\/?$/, '');

/** Download a binary endpoint (PDF/xlsx) with auth and save it via a temp link. */
export async function downloadFile(path, filename) {
  const res = await api.get(path, { responseType: 'blob' });
  const blobUrl = window.URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename || path.split('/').pop() || 'download';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(blobUrl);
}

function clearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('permissions');
}

function redirectToLogin() {
  if (!window.location.pathname.startsWith('/login')) {
    window.location.href = '/login';
  }
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers['x-auth-token'] = token;
  return config;
});

// Paths that must never trigger a refresh attempt.
const AUTH_PATHS = ['/auth/login', '/auth/refresh', '/auth/mfa/verify'];

let refreshPromise = null;

async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = api
      .post('/auth/refresh', {})
      .then((res) => {
        const { token, user, permissions } = res.data.data;
        localStorage.setItem('token', token);
        if (user) localStorage.setItem('user', JSON.stringify(user));
        if (permissions) localStorage.setItem('permissions', JSON.stringify(permissions));
        return token;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const { response, config } = error;
    const status = response?.status;
    const url = config?.url || '';
    const isAuthPath = AUTH_PATHS.some((p) => url.includes(p));

    // Try a single silent refresh for expired access tokens.
    if (status === 401 && !isAuthPath && config && !config._retried) {
      config._retried = true;
      try {
        const token = await refreshAccessToken();
        config.headers['x-auth-token'] = token;
        return api(config);
      } catch {
        clearSession();
        redirectToLogin();
        return Promise.reject(new Error('Your session has expired. Please sign in again.'));
      }
    }

    if (status === 401 && !isAuthPath) {
      clearSession();
      redirectToLogin();
    }

    const message =
      response?.data?.error?.message || error.message || 'Something went wrong';
    return Promise.reject(new Error(message));
  }
);

export default api;
