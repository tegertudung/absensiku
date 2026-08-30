import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// Static assets (e.g. /uploads/settings/logo/...) are served from the backend
// root, not under /api — strip the API suffix to get their origin.
const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, '');

/** Resolve a server-relative asset path (e.g. settings.logoPath) to a full URL. */
export function assetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${API_ORIGIN}${path}`;
}

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Attach the JWT to every request once the user is logged in.
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('absensiku_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// A 401 means the token is missing/expired — bounce back to login.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('absensiku_token');
      localStorage.removeItem('absensiku_user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
