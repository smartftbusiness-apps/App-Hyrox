import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { getSafeStorage } from '@/src/storage/safeStorage';

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
        const oid = get().organizerId;
        return !!oid && oid === eventOrganizerId;
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
