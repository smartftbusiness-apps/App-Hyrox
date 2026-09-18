import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { getSafeStorage } from '@/src/storage/safeStorage';

function markKey(eventId: string, stationOrder: number, participantKey: string): string {
  return `${eventId}:${stationOrder}:${participantKey}`;
}

function markTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (value === true) return 1;
  return null;
}

type StationMarksState = {
  marked: Record<string, number | true>;
  markStation: (eventId: string, stationOrder: number, participantKey: string) => void;
  isMarked: (eventId: string, stationOrder: number, participantKey: string) => boolean;
  isMarkedAfter: (
    eventId: string,
    stationOrder: number,
    participantKey: string,
    startedAtMs?: number | null,
  ) => boolean;
  clearEvent: (eventId: string) => void;
  clearParticipants: (eventId: string, participantKeys: string[]) => void;
};

export const useStationMarksStore = create<StationMarksState>()(
  persist(
    (set, get) => ({
      marked: {},
      markStation: (eventId, stationOrder, participantKey) => {
        const key = markKey(eventId, stationOrder, participantKey);
        set((state) => ({ marked: { ...state.marked, [key]: Date.now() } }));
      },
      isMarked: (eventId, stationOrder, participantKey) =>
        markTimestamp(get().marked[markKey(eventId, stationOrder, participantKey)]) != null,
      isMarkedAfter: (eventId, stationOrder, participantKey, startedAtMs) => {
        const at = markTimestamp(get().marked[markKey(eventId, stationOrder, participantKey)]);
        if (at == null) return false;
        if (startedAtMs && at <= startedAtMs) return false;
        return true;
      },
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
      clearParticipants: (eventId, participantKeys) => {
        if (participantKeys.length === 0) return;
        const suffixes = participantKeys.map((key) => `:${key}`);
        set((state) => {
          const next = { ...state.marked };
          for (const key of Object.keys(next)) {
            if (!key.startsWith(`${eventId}:`)) continue;
            if (suffixes.some((suffix) => key.endsWith(suffix))) delete next[key];
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
