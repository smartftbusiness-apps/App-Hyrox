import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AppUserRole } from '@/src/domain/appRole';
import { getSafeStorage } from '@/src/storage/safeStorage';

type AccessModeState = {
  appRole: AppUserRole;
  setAppRole: (role: AppUserRole) => void;
  isViewer: () => boolean;
  isOrganizer: () => boolean;
};

export const useAccessModeStore = create<AccessModeState>()(
  persist(
    (set, get) => ({
      appRole: 'organizer',
      setAppRole: (role) => set({ appRole: role }),
      isViewer: () => get().appRole === 'viewer',
      isOrganizer: () => get().appRole === 'organizer',
    }),
    {
      name: 'hyrox-access-mode',
      storage: createJSONStorage(getSafeStorage),
      partialize: (s) => ({ appRole: s.appRole }),
    },
  ),
);

export function useAppRole(): AppUserRole {
  return useAccessModeStore((s) => s.appRole);
}

export function useIsViewerMode(): boolean {
  return useAccessModeStore((s) => s.appRole === 'viewer');
}
