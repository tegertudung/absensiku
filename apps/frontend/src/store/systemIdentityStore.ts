import { create } from "zustand";
import api from "@/lib/api";

export interface SystemIdentity {
  systemName: string;
  institutionName: string;
  logoPath: string;
}

const fallbackIdentity: SystemIdentity = {
  systemName: "Pioner Class",
  institutionName: "Pioner Class",
  logoPath: "",
};

interface SystemIdentityState {
  identity: SystemIdentity;
  loaded: boolean;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
}

async function fetchIdentity() {
  const response = await api.get("/settings");
  return { ...fallbackIdentity, ...response.data.data } as SystemIdentity;
}

export const useSystemIdentityStore = create<SystemIdentityState>((set) => ({
  identity: fallbackIdentity,
  loaded: false,
  load: async () => {
    try {
      set({ identity: await fetchIdentity(), loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  refresh: async () => {
    try {
      set({ identity: await fetchIdentity(), loaded: true });
    } catch {
      // Keep the last known identity; the shell remains usable with its fallback.
    }
  },
}));
