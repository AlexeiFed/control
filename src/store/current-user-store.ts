"use client";

import { create } from "zustand";
import type { AuthUser } from "../lib/auth/session";

type CurrentUserState = {
  user: AuthUser | null;
  setUser: (user: AuthUser | null) => void;
};

export const useCurrentUserStore = create<CurrentUserState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}));
