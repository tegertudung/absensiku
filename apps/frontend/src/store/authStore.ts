import { create } from "zustand";
import api from "@/lib/api";

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
  logout: () => Promise<void>;
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

  logout: async () => {
    const token = localStorage.getItem("absensiku_token");
    const revokeRequest = token
      ? api.post("/auth/logout", undefined, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 5000,
        })
      : Promise.resolve();

    // Clear local state immediately. Server revocation is best-effort and
    // bounded so a network problem cannot leave the user trapped in the UI.
    localStorage.removeItem("absensiku_token");
    localStorage.removeItem("absensiku_user");
    set({ user: null, token: null });
    try {
      await revokeRequest;
    } catch {
      // A failed/revoked token or a network error must never trap the user.
    }
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
