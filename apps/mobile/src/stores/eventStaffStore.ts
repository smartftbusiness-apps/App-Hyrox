import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { getSafeStorage } from '@/src/storage/safeStorage';

export type EventStaffMember = {
  id: string;
  userId: string;
  email: string;
  fullName: string | null;
};

type EventStaffState = {
  /** Eventos (id local) em que o usuário logado é juiz designado */
  assignedEventIds: string[];
  /** Juízes por evento (id local) — preenchido pelo organizador */
  staffByEvent: Record<string, EventStaffMember[]>;
  setAssignedEventIds: (ids: string[]) => void;
  setStaffForEvent: (eventId: string, staff: EventStaffMember[]) => void;
  isAssignedJudge: (eventId: string | undefined) => boolean;
  clear: () => void;
};

export const useEventStaffStore = create<EventStaffState>()(
  persist(
    (set, get) => ({
      assignedEventIds: [],
      staffByEvent: {},
      setAssignedEventIds: (ids) => set({ assignedEventIds: ids }),
      setStaffForEvent: (eventId, staff) =>
        set((state) => ({
          staffByEvent: { ...state.staffByEvent, [eventId]: staff },
        })),
      isAssignedJudge: (eventId) =>
        !!eventId && get().assignedEventIds.includes(eventId),
      clear: () => set({ assignedEventIds: [], staffByEvent: {} }),
    }),
    {
      name: 'hyrox-event-staff',
      storage: createJSONStorage(getSafeStorage),
      partialize: (s) => ({
        assignedEventIds: s.assignedEventIds,
        staffByEvent: s.staffByEvent,
      }),
    },
  ),
);
