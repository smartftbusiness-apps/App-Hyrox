import { create } from 'zustand';

import { createJSONStorage, persist } from 'zustand/middleware';

import type { AppUserRole } from '@/src/domain/appRole';

import { getSafeStorage } from '@/src/storage/safeStorage';

type AccessModeState = {
  appRole: AppUserRole;
  setAppRole: (role: AppUserRole) => void;
  isJudge: () => boolean;
  isOrganizer: () => boolean;
  isAthlete: () => boolean;
};

export const useAccessModeStore = create<AccessModeState>()(
  persist(
    (set, get) => ({
      appRole: 'organizer',
      setAppRole: (role) => set({ appRole: role }),
      isJudge: () => get().appRole === 'judge',
      isOrganizer: () => get().appRole === 'organizer',
      isAthlete: () => get().appRole === 'athlete',
    }),
    {
      name: 'hyrox-access-mode',
      storage: createJSONStorage(getSafeStorage),
      partialize: (s) => ({ appRole: s.appRole }),
      version: 3,
      migrate: (persisted) => {
        const state = persisted as { appRole?: string };
        if (state.appRole === 'viewer' || state.appRole === 'staff') {
          state.appRole = state.appRole === 'staff' ? 'judge' : 'athlete';
        }
        if (
          state.appRole !== 'organizer' &&
          state.appRole !== 'judge' &&
          state.appRole !== 'athlete'
        ) {
          state.appRole = 'organizer';
        }
        return state as AccessModeState;
      },
    },
  ),
);

export function useAppRole(): AppUserRole {
  return useAccessModeStore((s) => s.appRole);
}

export function useIsJudgeMode(): boolean {
  return useAccessModeStore((s) => s.appRole === 'judge');
}

export function useIsAthleteMode(): boolean {
  return useAccessModeStore((s) => s.appRole === 'athlete');
}

/** @deprecated use useIsJudgeMode */
export function useIsViewerMode(): boolean {
  return useIsJudgeMode();
}
