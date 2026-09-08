import { create } from "zustand";

export interface AuthUser {
  id: string;
  email: string;
  role: "ADMIN" | "TENTOR" | "PARENT";
  isPrimaryAdmin?: boolean;
  mustChangePassword?: boolean;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isHydrated: boolean;
  setAuth: (user: AuthUser, token: string) => void;
  updateUser: (patch: Partial<AuthUser>) => void;
  logout: () => void;
  hydrate: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isHydrated: false,

  setAuth: (user, token) => {
    localStorage.setItem("absensiku_token", token);
    localStorage.setItem("absensiku_user", JSON.stringify(user));
    set({ user, token });
  },

  // Patches the cached user in place (e.g. clearing mustChangePassword right
  // after a successful change) without a fresh login round trip.
  updateUser: (patch) => {
    set((state) => {
      if (!state.user) return state;
      const user = { ...state.user, ...patch };
      localStorage.setItem("absensiku_user", JSON.stringify(user));
      return { user };
    });
  },

  logout: () => {
    localStorage.removeItem("absensiku_token");
    localStorage.removeItem("absensiku_user");
    set({ user: null, token: null });
  },

  // Restore session from localStorage on app load (client-side only).
  hydrate: () => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("absensiku_token");
    const userRaw = localStorage.getItem("absensiku_user");
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
