/**
 * Auth store — tracks who is logged in.
 *
 * Beginner note: we separate auth state from app state because
 * many components need the role/name but don't need incident data.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Role } from '@contracts/types';

interface AuthState {
  token: string | null;
  role: Role | null;
  displayName: string | null;
  unitId: string | null; // only for crew
  isLoggedIn: boolean;
  login: (token: string, role: Role, displayName: string, unitId: string | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  // persist = automatically saves to localStorage so login survives page refresh
  persist(
    (set) => ({
      token: null,
      role: null,
      displayName: null,
      unitId: null,
      isLoggedIn: false,

      login: (token, role, displayName, unitId) =>
        set({ token, role, displayName, unitId, isLoggedIn: true }),

      logout: () =>
        set({ token: null, role: null, displayName: null, unitId: null, isLoggedIn: false }),
    }),
    {
      name: 'samanvaya-auth', // localStorage key
    }
  )
);
