import { useEventsStore } from '@/src/stores/eventsStore';
import { useOrganizerStore } from '@/src/stores/organizerStore';
import type { HyroxEvent } from '@/src/domain/types';

/** Selector estável — evita loop infinito de re-renders */
export function useEvent(eventId: string | undefined): HyroxEvent | undefined {
  return useEventsStore((s) =>
    eventId ? s.events.find((e) => e.id === eventId) : undefined,
  );
}

/** Verdadeiro se o usuário atual criou o evento neste aparelho. */
export function useIsEventOwner(event: HyroxEvent | undefined): boolean {
  const organizerId = useOrganizerStore((s) => s.organizerId);
  if (!event || !organizerId) return false;
  return event.organizerId === organizerId;
}

export const useIsEventCreator = useIsEventOwner;
