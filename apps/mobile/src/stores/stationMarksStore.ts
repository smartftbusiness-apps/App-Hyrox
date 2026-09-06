import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { getSafeStorage } from '@/src/storage/safeStorage';

function markKey(eventId: string, stationOrder: number, participantKey: string): string {
  return `${eventId}:${stationOrder}:${participantKey}`;
}

type StationMarksState = {
  marked: Record<string, true>;
  markStation: (eventId: string, stationOrder: number, participantKey: string) => void;
  isMarked: (eventId: string, stationOrder: number, participantKey: string) => boolean;
  clearEvent: (eventId: string) => void;
};

export const useStationMarksStore = create<StationMarksState>()(
  persist(
    (set, get) => ({
      marked: {},
      markStation: (eventId, stationOrder, participantKey) => {
        const key = markKey(eventId, stationOrder, participantKey);
        if (get().marked[key]) return;
        set((state) => ({ marked: { ...state.marked, [key]: true } }));
      },
      isMarked: (eventId, stationOrder, participantKey) =>
        !!get().marked[markKey(eventId, stationOrder, participantKey)],
      clearEvent: (eventId) => {
        const prefix = `${eventId}:`;
        set((state) => {
          const next = { ...state.marked };
          for (const key of Object.keys(next)) {
            if (key.startsWith(prefix)) delete next[key];
          }
          return { marked: next };
        });
      },
    }),
    {
      name: 'hyrox-station-marks',
      storage: createJSONStorage(getSafeStorage),
    },
  ),
);
