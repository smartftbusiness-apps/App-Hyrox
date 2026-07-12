import { useEventsStore } from '@/src/stores/eventsStore';
import { useOrganizerStore } from '@/src/stores/organizerStore';
import { isLegacyLocalOrganizerId } from '@/src/utils/eventOwnership';

/** Alinha organizerId local com a conta Supabase (corrige eventos criados antes do login). */
export function reconcileOrganizerWithAuth(userId: string): void {
  useOrganizerStore.setState({ organizerId: userId });
  useEventsStore.setState((state) => ({
    events: state.events.map((e) => {
      if (e.organizerId === userId) return e;
      if (isLegacyLocalOrganizerId(e.organizerId)) return { ...e, organizerId: userId };
      return e;
    }),
  }));
}
