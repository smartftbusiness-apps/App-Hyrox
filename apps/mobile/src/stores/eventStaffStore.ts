import { create } from 'zustand';

import { createJSONStorage, persist } from 'zustand/middleware';

import { getSafeStorage } from '@/src/storage/safeStorage';



export type EventStaffMember = {
  id: string;
  userId: string;
  email: string;
  fullName: string | null;
  /** order do segmento estação (ex.: 2 = SkiErg) */
  stationOrder: number | null;
};



type EventStaffState = {

  /** Eventos (id local) em que o usuário logado é juiz designado */

  assignedEventIds: string[];

  /** Juízes por evento (id local) — preenchido pelo organizador */
  staffByEvent: Record<string, EventStaffMember[]>;

  /** Estação designada ao juiz logado (id local do evento → order do segmento) */
  judgeStationByEvent: Record<string, number | null>;

  setAssignedEventIds: (ids: string[]) => void;

  setStaffForEvent: (eventId: string, staff: EventStaffMember[]) => void;

  setJudgeStationForEvent: (eventId: string, stationOrder: number | null) => void;

  setJudgeStations: (assignments: Record<string, number | null>) => void;

  getJudgeStation: (eventId: string | undefined) => number | null | undefined;

  isAssignedJudge: (eventId: string | undefined) => boolean;

  clear: () => void;

};



export const useEventStaffStore = create<EventStaffState>()(

  persist(

    (set, get) => ({

      assignedEventIds: [],
      staffByEvent: {},
      judgeStationByEvent: {},

      setAssignedEventIds: (ids) => set({ assignedEventIds: ids }),

      setStaffForEvent: (eventId, staff) =>
        set((state) => ({
          staffByEvent: { ...state.staffByEvent, [eventId]: staff },
        })),

      setJudgeStationForEvent: (eventId, stationOrder) =>
        set((state) => ({
          judgeStationByEvent: { ...state.judgeStationByEvent, [eventId]: stationOrder },
        })),

      setJudgeStations: (assignments) =>
        set((state) => ({
          judgeStationByEvent: { ...state.judgeStationByEvent, ...assignments },
        })),

      getJudgeStation: (eventId) =>
        eventId ? get().judgeStationByEvent[eventId] : undefined,

      isAssignedJudge: (eventId) => {
        if (!eventId) return false;
        if (get().assignedEventIds.includes(eventId)) return true;
        return Object.prototype.hasOwnProperty.call(get().judgeStationByEvent, eventId);
      },

      clear: () =>
        set({ assignedEventIds: [], staffByEvent: {}, judgeStationByEvent: {} }),

    }),

    {

      name: 'hyrox-event-staff',

      storage: createJSONStorage(getSafeStorage),

      partialize: (s) => ({
        assignedEventIds: s.assignedEventIds,
        staffByEvent: s.staffByEvent,
        judgeStationByEvent: s.judgeStationByEvent,
      }),

    },

  ),

);


