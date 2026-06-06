import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  Category,
  Division,
  EventHeat,
  EventStatus,
  Gender,
  HyroxEvent,
  Segment,
  SegmentType,
} from '@/src/domain/types';
import { cloneHyroxSegments } from '@/src/domain/hyroxTemplate';
import { MOCK_EVENTS } from '@/src/data/mockData';
import { getSafeStorage } from '@/src/storage/safeStorage';
import {
  buildCategoriesForEvent,
  DEFAULT_EVENT_PRESET_KEYS,
  presetsFromKeys,
} from '@/src/domain/categoryPresets';
import { buildCategoryName } from '@/src/utils/categoryLabel';
import { useOrganizerStore } from '@/src/stores/organizerStore';
import { useAthletesStore } from '@/src/stores/athletesStore';
import {
  createEventInSupabase,
  deleteEventInSupabase,
  finishEventInSupabase,
} from '@/src/api/eventsRepository';
import { pushEventToSupabase, scheduleEventSync } from '@/src/api/syncService';
import { isSupabaseConfigured } from '@/src/lib/supabase';
import { getEventFinishReadiness, getFinishEventBlockReason } from '@/src/utils/eventFinish';

export type CreateEventInput = {
  name: string;
  location: string;
  date: string;
  status?: EventStatus;
  /** Chaves de EVENT_CATEGORY_PRESETS — ex: open-m, doubles-f */
  categoryPresetKeys?: string[];
};

export type AddCategoryInput = {
  division: Division;
  gender: Gender;
  name?: string;
};

export type AddSegmentInput = {
  type: SegmentType;
  name: string;
  target: string;
};

export type AddHeatInput = {
  name: string;
  scheduledStartAt: string;
  categoryIds?: string[];
  bibNumbers?: number[];
};

export type ActionResult = { ok: true; warning?: string } | { ok: false; reason: string };

type EventsState = {
  events: HyroxEvent[];
  hydrated: boolean;
  addEvent: (input: CreateEventInput) => HyroxEvent;
  addCategory: (eventId: string, input: AddCategoryInput) => ActionResult;
  removeCategory: (eventId: string, categoryId: string) => ActionResult;
  addSegment: (eventId: string, input: AddSegmentInput) => ActionResult;
  removeSegment: (eventId: string, segmentId: string) => ActionResult;
  resetSegmentsToHyrox: (eventId: string) => ActionResult;
  updateEventStatus: (eventId: string, status: EventStatus) => ActionResult;
  finishEvent: (eventId: string) => Promise<ActionResult>;
  deleteEvent: (eventId: string) => Promise<ActionResult>;
  addHeat: (eventId: string, input: AddHeatInput) => ActionResult;
  removeHeat: (eventId: string, heatId: string) => ActionResult;
  markHeatStarted: (eventId: string, heatId: string, startedAt?: string) => ActionResult;
  setHydrated: (value: boolean) => void;
};

function createDefaultCategories(eventId: string): Category[] {
  return buildCategoriesForEvent(eventId, presetsFromKeys(DEFAULT_EVENT_PRESET_KEYS));
}

function generateEventId(): string {
  return `evt-${Date.now()}`;
}

function migrateEventCategories(event: HyroxEvent): Category[] {
  const cats = event.categories?.length ? event.categories : createDefaultCategories(event.id);
  const hasDoubles = cats.some((c) => c.division === 'Doubles');
  if (hasDoubles) return cats;

  const onlyLegacyOpen =
    cats.length === 2 && cats.every((c) => c.division === 'Open');
  if (onlyLegacyOpen) {
    return [
      ...cats,
      ...buildCategoriesForEvent(event.id, presetsFromKeys(['doubles-m', 'doubles-f'])),
    ];
  }
  return cats;
}

function migrateEvent(event: HyroxEvent, fallbackOrganizerId: string): HyroxEvent {
  return {
    ...event,
    supabaseId: event.supabaseId ?? null,
    organizerId: event.organizerId ?? fallbackOrganizerId,
    segments: event.segments?.length ? event.segments : cloneHyroxSegments(event.id),
    categories: migrateEventCategories(event),
    heats: event.heats ?? [],
  };
}

function migrateEvents(events: HyroxEvent[], fallbackOrganizerId: string): HyroxEvent[] {
  return events.map((e) => migrateEvent(e, fallbackOrganizerId));
}

function patchEvent(
  events: HyroxEvent[],
  eventId: string,
  patch: (event: HyroxEvent) => HyroxEvent,
): HyroxEvent[] {
  return events.map((e) => (e.id === eventId ? patch(e) : e));
}

function reindexSegments(segments: Segment[]): Segment[] {
  return segments
    .sort((a, b) => a.order - b.order)
    .map((seg, idx) => ({ ...seg, order: idx + 1 }));
}

function isEventCreator(event: HyroxEvent): boolean {
  return useOrganizerStore.getState().isEventOwner(event.organizerId);
}

function assertEventCreator(event: HyroxEvent | undefined): ActionResult {
  if (!event) return { ok: false, reason: 'Evento não encontrado' };
  if (!isEventCreator(event)) {
    return { ok: false, reason: 'Apenas quem criou o evento pode alterar' };
  }
  if (event.status === 'finished') {
    return { ok: false, reason: 'Evento encerrado — edição bloqueada' };
  }
  return { ok: true };
}

function assertEventCreatorCanFinish(event: HyroxEvent | undefined): ActionResult {
  if (!event) return { ok: false, reason: 'Evento não encontrado' };
  if (!isEventCreator(event)) {
    return { ok: false, reason: 'Apenas quem criou o evento pode encerrar' };
  }
  if (event.status === 'finished') {
    return { ok: false, reason: 'Evento já encerrado' };
  }
  return { ok: true };
}

export const useEventsStore = create<EventsState>()(
  persist(
    (set, get) => ({
      events: MOCK_EVENTS,
      hydrated: typeof window !== 'undefined',
      setHydrated: (value) => set({ hydrated: value }),
      addEvent: (input) => {
        const organizerId = useOrganizerStore.getState().ensureOrganizerId();
        const id = generateEventId();
        const presetKeys =
          input.categoryPresetKeys?.length ? input.categoryPresetKeys : DEFAULT_EVENT_PRESET_KEYS;
        const event: HyroxEvent = {
          id,
          supabaseId: null,
          organizerId,
          name: input.name.trim(),
          location: input.location.trim(),
          date: input.date,
          status: input.status ?? 'draft',
          athleteCount: 0,
          categories: buildCategoriesForEvent(id, presetsFromKeys(presetKeys)),
          segments: cloneHyroxSegments(id),
        };
        set((state) => ({ events: [event, ...state.events] }));

        if (isSupabaseConfigured()) {
          void createEventInSupabase(event).then((result) => {
            if (!result.ok || !result.data) return;
            set((state) => ({
              events: patchEvent(state.events, id, (e) => ({ ...e, supabaseId: result.data })),
            }));
            scheduleEventSync(id);
          });
        }

        return event;
      },
      addCategory: (eventId, input) => {
        const event = get().events.find((e) => e.id === eventId);
        const auth = assertEventCreator(event);
        if (!auth.ok) return auth;
        const name = input.name?.trim() || buildCategoryName(input.division, input.gender);
        const category: Category = {
          id: `${eventId}-cat-${Date.now()}`,
          name,
          division: input.division,
          gender: input.gender,
        };
        set((state) => ({
          events: patchEvent(state.events, eventId, (e) => ({
            ...e,
            categories: [...e.categories, category],
          })),
        }));
        scheduleEventSync(eventId);
        return { ok: true };
      },
      removeCategory: (eventId, categoryId) => {
        const event = get().events.find((e) => e.id === eventId);
        const auth = assertEventCreator(event);
        if (!auth.ok) return auth;
        set((state) => ({
          events: patchEvent(state.events, eventId, (e) => ({
            ...e,
            categories: e.categories.filter((c) => c.id !== categoryId),
          })),
        }));
        return { ok: true };
      },
      addSegment: (eventId, input) => {
        const event = get().events.find((e) => e.id === eventId);
        const auth = assertEventCreator(event);
        if (!auth.ok) return auth;
        set((state) => ({
          events: patchEvent(state.events, eventId, (e) => {
            const order = e.segments.length + 1;
            const segment: Segment = {
              id: `${eventId}-seg-${Date.now()}`,
              order,
              type: input.type,
              name: input.name.trim(),
              target: input.target.trim(),
            };
            return { ...e, segments: [...e.segments, segment] };
          }),
        }));
        return { ok: true };
      },
      removeSegment: (eventId, segmentId) => {
        const event = get().events.find((e) => e.id === eventId);
        const auth = assertEventCreator(event);
        if (!auth.ok) return auth;
        set((state) => ({
          events: patchEvent(state.events, eventId, (e) => ({
            ...e,
            segments: reindexSegments(e.segments.filter((s) => s.id !== segmentId)),
          })),
        }));
        return { ok: true };
      },
      resetSegmentsToHyrox: (eventId) => {
        const event = get().events.find((e) => e.id === eventId);
        const auth = assertEventCreator(event);
        if (!auth.ok) return auth;
        set((state) => ({
          events: patchEvent(state.events, eventId, (e) => ({
            ...e,
            segments: cloneHyroxSegments(eventId),
          })),
        }));
        return { ok: true };
      },
      updateEventStatus: (eventId, status) => {
        const event = get().events.find((e) => e.id === eventId);
        const auth = assertEventCreator(event);
        if (!auth.ok) return auth;
        set((state) => ({
          events: patchEvent(state.events, eventId, (e) => ({ ...e, status })),
        }));
        scheduleEventSync(eventId);
        return { ok: true };
      },
      finishEvent: async (eventId) => {
        try {
          const event = get().events.find((e) => e.id === eventId);
          const auth = assertEventCreatorCanFinish(event);
          if (!auth.ok) return auth;

          const { athletes, pairs } = useAthletesStore.getState();
          const eventAthletes = athletes.filter((a) => a.eventId === eventId);
          const eventPairs = pairs.filter((p) => p.eventId === eventId);
          const readiness = getEventFinishReadiness(eventAthletes, eventPairs);
          const blockReason = getFinishEventBlockReason(readiness);
          if (blockReason) return { ok: false, reason: blockReason };

          set((state) => ({
            events: patchEvent(state.events, eventId, (e) => ({
              ...e,
              status: 'finished',
            })),
          }));

          if (!isSupabaseConfigured()) return { ok: true };

          try {
            const dbResult = await finishEventInSupabase({ ...event!, status: 'finished' });
            void pushEventToSupabase(eventId);
            if (!dbResult.ok) {
              return {
                ok: true,
                warning: `Evento encerrado no app, mas não foi salvo no Supabase: ${dbResult.reason}`,
              };
            }

            if (dbResult.data) {
              set((state) => ({
                events: patchEvent(state.events, eventId, (e) => ({
                  ...e,
                  supabaseId: dbResult.data ?? e.supabaseId ?? null,
                })),
              }));
            }
          } catch (syncError) {
            const message =
              syncError instanceof Error ? syncError.message : 'Erro de sincronização';
            return {
              ok: true,
              warning: `Evento encerrado no app, mas não foi salvo no Supabase: ${message}`,
            };
          }

          return { ok: true };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro inesperado';
          return { ok: false, reason: message };
        }
      },
      deleteEvent: async (eventId) => {
        const event = get().events.find((e) => e.id === eventId);
        const auth = assertEventCreator(event);
        if (!auth.ok) return auth;

        set((state) => ({ events: state.events.filter((e) => e.id !== eventId) }));
        const { athletes, pairs } = useAthletesStore.getState();
        useAthletesStore.setState({
          athletes: athletes.filter((a) => a.eventId !== eventId),
          pairs: pairs.filter((p) => p.eventId !== eventId),
        });

        if (event && isSupabaseConfigured()) {
          const result = await deleteEventInSupabase(event);
          if (!result.ok) {
            return { ok: false, reason: result.reason };
          }
        }
        return { ok: true };
      },
      addHeat: (eventId, input) => {
        const event = get().events.find((e) => e.id === eventId);
        const auth = assertEventCreator(event);
        if (!auth.ok) return auth;
        const heat: EventHeat = {
          id: `${eventId}-heat-${Date.now()}`,
          name: input.name.trim(),
          scheduledStartAt: input.scheduledStartAt,
          categoryIds: input.categoryIds ?? [],
          bibNumbers: input.bibNumbers ?? [],
          startedAt: null,
        };
        set((state) => ({
          events: patchEvent(state.events, eventId, (e) => ({
            ...e,
            heats: [...(e.heats ?? []), heat],
          })),
        }));
        return { ok: true };
      },
      removeHeat: (eventId, heatId) => {
        const event = get().events.find((e) => e.id === eventId);
        const auth = assertEventCreator(event);
        if (!auth.ok) return auth;
        set((state) => ({
          events: patchEvent(state.events, eventId, (e) => ({
            ...e,
            heats: (e.heats ?? []).filter((h) => h.id !== heatId),
          })),
        }));
        return { ok: true };
      },
      markHeatStarted: (eventId, heatId, startedAt) => {
        const event = get().events.find((e) => e.id === eventId);
        if (!event || event.status === 'finished') {
          return { ok: false, reason: 'Evento não disponível' };
        }
        const at = startedAt ?? new Date().toISOString();
        set((state) => ({
          events: patchEvent(state.events, eventId, (e) => ({
            ...e,
            heats: (e.heats ?? []).map((h) =>
              h.id === heatId ? { ...h, startedAt: at } : h,
            ),
          })),
        }));
        return { ok: true };
      },
    }),
    {
      name: 'hyrox-events',
      storage: createJSONStorage(getSafeStorage),
      skipHydration: true,
      partialize: (state) => ({ events: state.events }),
    },
  ),
);

export async function hydrateEventsStore(): Promise<void> {
  if (typeof window === 'undefined') return;
  await useOrganizerStore.persist.rehydrate();
  const organizerId = useOrganizerStore.getState().ensureOrganizerId();
  await useEventsStore.persist.rehydrate();
  useEventsStore.setState((state) => ({
    events: migrateEvents(state.events, organizerId),
    hydrated: true,
  }));
}

export function useEvents() {
  return useEventsStore((s) => s.events);
}
