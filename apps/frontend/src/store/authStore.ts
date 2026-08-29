import { create } from 'zustand';

export interface AuthUser {
  id: string;
  email: string;
  role: 'ADMIN' | 'TENTOR' | 'PARENT';
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isHydrated: boolean;
  setAuth: (user: AuthUser, token: string) => void;
  logout: () => void;
  hydrate: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isHydrated: false,

  setAuth: (user, token) => {
    localStorage.setItem('absensiku_token', token);
    localStorage.setItem('absensiku_user', JSON.stringify(user));
    set({ user, token });
  },

  logout: () => {
    localStorage.removeItem('absensiku_token');
    localStorage.removeItem('absensiku_user');
    set({ user: null, token: null });
  },

  // Restore session from localStorage on app load (client-side only).
  hydrate: () => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('absensiku_token');
    const userRaw = localStorage.getItem('absensiku_user');
    if (token && userRaw) {
      try {
        const user = JSON.parse(userRaw) as AuthUser;
        set({ user, token, isHydrated: true });
        return;
      } catch {
        // fall through to clear + mark hydrated
      }
    }
    set({ isHydrated: true });
  },
}));
