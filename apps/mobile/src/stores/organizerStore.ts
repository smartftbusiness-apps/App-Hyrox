import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { getSafeStorage } from '@/src/storage/safeStorage';
import { useAuthStore } from '@/src/stores/authStore';
import { isEventOwnedByCurrentUser } from '@/src/utils/eventOwnership';

type OrganizerState = {
  organizerId: string | null;
  ensureOrganizerId: () => string;
  isEventOwner: (eventOrganizerId: string) => boolean;
};

export const useOrganizerStore = create<OrganizerState>()(
  persist(
    (set, get) => ({
      organizerId: null,
      ensureOrganizerId: () => {
        const existing = get().organizerId;
        if (existing) return existing;
        const id = `org-${Date.now()}`;
        set({ organizerId: id });
        return id;
      },
      isEventOwner: (eventOrganizerId) => {
        const authUserId = useAuthStore.getState().user?.id;
        return isEventOwnedByCurrentUser(
          { organizerId: eventOrganizerId },
          authUserId,
          get().organizerId,
        );
      },
    }),
    {
      name: 'hyrox-organizer',
      storage: createJSONStorage(getSafeStorage),
      skipHydration: true,
      partialize: (state) => ({ organizerId: state.organizerId }),
    },
  ),
);

export async function hydrateOrganizerStore(): Promise<void> {
  if (typeof window === 'undefined') return;
  await useOrganizerStore.persist.rehydrate();
  useOrganizerStore.getState().ensureOrganizerId();
}
