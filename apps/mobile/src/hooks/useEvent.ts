import { isUuid } from '@/src/api/repositoryTypes';
import type { HyroxEvent } from '@/src/domain/types';
import { useEventsStore } from '@/src/stores/eventsStore';
import { useAuthStore } from '@/src/stores/authStore';
import { useOrganizerStore } from '@/src/stores/organizerStore';
import { isEventOwnedByCurrentUser } from '@/src/utils/eventOwnership';

/** Selector estável — evita loop infinito de re-renders */
export function useEvent(eventId: string | undefined): HyroxEvent | undefined {
  return useEventsStore((s) =>
    eventId ? s.events.find((e) => e.id === eventId) : undefined,
  );
}

/** Verdadeiro se o usuário atual criou o evento neste aparelho. */
export function useIsEventOwner(event: HyroxEvent | undefined): boolean {
  const organizerId = useOrganizerStore((s) => s.organizerId);
  const authUserId = useAuthStore((s) => s.user?.id);
  return isEventOwnedByCurrentUser(event, authUserId, organizerId);
}

export const useIsEventCreator = useIsEventOwner;
