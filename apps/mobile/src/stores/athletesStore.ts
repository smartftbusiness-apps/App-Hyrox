import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import type { Athlete, AthleteStatus, DoublesPair, SegmentTime } from '@/src/domain/types';
import { MOCK_ATHLETES, MOCK_PAIRS } from '@/src/data/mockData';
import { getSafeStorage } from '@/src/storage/safeStorage';
import { scheduleEventSync } from '@/src/api/syncService';
import { useEventsStore } from '@/src/stores/eventsStore';
import { useOrganizerStore } from '@/src/stores/organizerStore';

function syncEvent(eventId: string): void {
  scheduleEventSync(eventId);
}

export type AddAthleteInput = {
  name: string;
  bib: number;
  categoryId: string;
};

export type CreatePairInput = {
  categoryId: string;
  athlete1Id: string;
  athlete2Id: string;
  bib: number;
  teamName?: string;
};

export type AddDoublesTeamInput = {
  categoryId: string;
  bib: number;
  name1: string;
  name2: string;
  teamName?: string;
};

export type ActionResult = { ok: true } | { ok: false; reason: string };

type AthletesState = {
  athletes: Athlete[];
  pairs: DoublesPair[];
  addAthlete: (eventId: string, input: AddAthleteInput) => ActionResult;
  removeAthlete: (eventId: string, athleteId: string) => ActionResult;
  updateAthleteName: (eventId: string, athleteId: string, name: string) => ActionResult;
  updateAthleteBib: (eventId: string, athleteId: string, bib: number) => ActionResult;
  updateAthleteCategory: (eventId: string, athleteId: string, categoryId: string) => ActionResult;
  updatePairTeamName: (eventId: string, pairId: string, teamName: string) => ActionResult;
  updatePairBib: (eventId: string, pairId: string, bib: number) => ActionResult;
  updatePairCategory: (eventId: string, pairId: string, categoryId: string) => ActionResult;
  setParticipantStatus: (
    eventId: string,
    participantId: string,
    type: 'athlete' | 'pair',
    status: AthleteStatus,
  ) => ActionResult;
  recordParticipantFinish: (
    eventId: string,
    participantId: string,
    type: 'athlete' | 'pair',
    totalMs: number,
    segmentTimes?: SegmentTime[],
  ) => ActionResult;
  createPair: (eventId: string, input: CreatePairInput) => ActionResult;
  addDoublesTeam: (eventId: string, input: AddDoublesTeamInput) => ActionResult;
  removePair: (eventId: string, pairId: string) => ActionResult;
  dissolvePair: (eventId: string, pairId: string) => ActionResult;
  getNextBib: (eventId: string) => number;
};

function assertCanManageAthletes(eventId: string): ActionResult {
  const event = useEventsStore.getState().events.find((e) => e.id === eventId);
  if (!event) return { ok: false, reason: 'Evento não encontrado' };
  if (event.status === 'finished') {
    return { ok: false, reason: 'Evento encerrado — edição bloqueada' };
  }
  const owner = useOrganizerStore.getState().isEventOwner(event.organizerId);
  if (!owner) {
    return { ok: false, reason: 'Apenas quem criou o evento pode alterar participantes' };
  }
  return { ok: true };
}

function assertCanAddAthletesToEvent(eventId: string): ActionResult {
  const auth = assertCanManageAthletes(eventId);
  if (!auth.ok) return auth;
  const event = useEventsStore.getState().events.find((e) => e.id === eventId);
  if (!event?.categories.length) {
    return { ok: false, reason: 'Cadastre categorias no evento antes de inscrever atletas' };
  }
  return { ok: true };
}

function isBibTaken(eventId: string, bib: number, athletes: Athlete[], pairs: DoublesPair[]): boolean {
  if (bib <= 0) return false;
  return (
    athletes.some((a) => a.eventId === eventId && a.bib === bib) ||
    pairs.some((p) => p.eventId === eventId && p.bib === bib)
  );
}

function getCategory(eventId: string, categoryId: string) {
  return useEventsStore.getState().events.find((e) => e.id === eventId)?.categories.find(
    (c) => c.id === categoryId,
  );
}

function assertEventAllowsTiming(eventId: string): ActionResult {
  const event = useEventsStore.getState().events.find((e) => e.id === eventId);
  if (!event) return { ok: false, reason: 'Evento não encontrado' };
  if (event.status === 'finished') return { ok: false, reason: 'Evento encerrado' };
  if (event.status === 'draft') {
    return { ok: false, reason: 'Abra inscrições ou coloque o evento ao vivo para cronometrar' };
  }
  return { ok: true };
}

export const useAthletesStore = create<AthletesState>()(
  persist(
    (set, get) => ({
      athletes: MOCK_ATHLETES.map((a) => ({ ...a, pairId: a.pairId ?? null })),
      pairs: MOCK_PAIRS,
      getNextBib: (eventId) => {
        const bibs = [
          ...get().athletes.filter((a) => a.eventId === eventId).map((a) => a.bib),
          ...get().pairs.filter((p) => p.eventId === eventId).map((p) => p.bib),
        ].filter((b) => b > 0);
        return bibs.length ? Math.max(...bibs) + 1 : 101;
      },
      addAthlete: (eventId, input) => {
        const auth = assertCanAddAthletesToEvent(eventId);
        if (!auth.ok) return auth;

        const category = getCategory(eventId, input.categoryId);
        if (!category) return { ok: false, reason: 'Categoria inválida para este evento' };

        const name = input.name.trim();
        if (!name) return { ok: false, reason: 'Informe o nome do atleta' };

        const isDoubles = category.division === 'Doubles';
        const bib = isDoubles && input.bib <= 0 ? 0 : input.bib;

        if (!isDoubles) {
          if (!Number.isInteger(input.bib) || input.bib <= 0) {
            return { ok: false, reason: 'Bib deve ser um número positivo' };
          }
          if (isBibTaken(eventId, input.bib, get().athletes, get().pairs)) {
            return { ok: false, reason: `Bib #${input.bib} já está em uso neste evento` };
          }
        }

        const athlete: Athlete = {
          id: `ath-${eventId}-${Date.now()}`,
          eventId,
          name,
          bib,
          categoryId: input.categoryId,
          pairId: null,
          status: 'registered' as AthleteStatus,
          totalMs: null,
        };

        set((state) => ({ athletes: [...state.athletes, athlete] }));
        syncEvent(eventId);
        return { ok: true };
      },
      removeAthlete: (eventId, athleteId) => {
        const auth = assertCanManageAthletes(eventId);
        if (!auth.ok) return auth;

        const athlete = get().athletes.find((a) => a.id === athleteId && a.eventId === eventId);
        if (athlete?.pairId) {
          return { ok: false, reason: 'Desfaça a dupla antes de remover o atleta' };
        }

        set((state) => ({
          athletes: state.athletes.filter((a) => !(a.id === athleteId && a.eventId === eventId)),
        }));
        syncEvent(eventId);
        return { ok: true };
      },
      updateAthleteName: (eventId, athleteId, name) => {
        const auth = assertCanManageAthletes(eventId);
        if (!auth.ok) return auth;
        const trimmed = name.trim();
        if (!trimmed) return { ok: false, reason: 'Informe o nome do atleta' };
        const athlete = get().athletes.find((a) => a.id === athleteId && a.eventId === eventId);
        if (!athlete) return { ok: false, reason: 'Atleta não encontrado' };

        set((state) => ({
          athletes: state.athletes.map((a) =>
            a.id === athleteId && a.eventId === eventId ? { ...a, name: trimmed } : a,
          ),
        }));
        syncEvent(eventId);
        return { ok: true };
      },
      updateAthleteBib: (eventId, athleteId, bib) => {
        const auth = assertCanManageAthletes(eventId);
        if (!auth.ok) return auth;
        const athlete = get().athletes.find((a) => a.id === athleteId && a.eventId === eventId);
        if (!athlete) return { ok: false, reason: 'Atleta não encontrado' };
        if (athlete.pairId) return { ok: false, reason: 'Edite o bib da dupla, não do atleta individual' };
        const category = getCategory(eventId, athlete.categoryId);
        if (category?.division === 'Doubles') {
          return { ok: false, reason: 'Atletas Doubles recebem bib ao formar a dupla' };
        }
        if (!Number.isInteger(bib) || bib <= 0) {
          return { ok: false, reason: 'Bib deve ser um número positivo' };
        }
        if (isBibTaken(eventId, bib, get().athletes, get().pairs)) {
          return { ok: false, reason: `Bib #${bib} já está em uso neste evento` };
        }

        set((state) => ({
          athletes: state.athletes.map((a) =>
            a.id === athleteId && a.eventId === eventId ? { ...a, bib } : a,
          ),
        }));
        syncEvent(eventId);
        return { ok: true };
      },
      updateAthleteCategory: (eventId, athleteId, categoryId) => {
        const auth = assertCanManageAthletes(eventId);
        if (!auth.ok) return auth;

        const athlete = get().athletes.find((a) => a.id === athleteId && a.eventId === eventId);
        if (!athlete) return { ok: false, reason: 'Atleta não encontrado' };
        if (athlete.pairId) {
          return { ok: false, reason: 'Desfaça a dupla antes de mudar a categoria' };
        }
        const category = getCategory(eventId, categoryId);
        if (!category) return { ok: false, reason: 'Categoria inválida' };

        const isDoubles = category.division === 'Doubles';
        let newBib = athlete.bib;
        if (isDoubles) {
          newBib = 0;
        } else if (newBib <= 0) {
          newBib = get().getNextBib(eventId);
        }

        set((state) => ({
          athletes: state.athletes.map((a) =>
            a.id === athleteId && a.eventId === eventId
              ? { ...a, categoryId, bib: newBib }
              : a,
          ),
        }));
        syncEvent(eventId);
        return { ok: true };
      },
      updatePairTeamName: (eventId, pairId, teamName) => {
        const auth = assertCanManageAthletes(eventId);
        if (!auth.ok) return auth;
        const pair = get().pairs.find((p) => p.id === pairId && p.eventId === eventId);
        if (!pair) return { ok: false, reason: 'Dupla não encontrada' };

        const trimmed = teamName.trim();
        set((state) => ({
          pairs: state.pairs.map((p) =>
            p.id === pairId && p.eventId === eventId
              ? { ...p, teamName: trimmed || undefined }
              : p,
          ),
        }));
        syncEvent(eventId);
        return { ok: true };
      },
      updatePairBib: (eventId, pairId, bib) => {
        const auth = assertCanManageAthletes(eventId);
        if (!auth.ok) return auth;
        const pair = get().pairs.find((p) => p.id === pairId && p.eventId === eventId);
        if (!pair) return { ok: false, reason: 'Dupla não encontrada' };
        if (!Number.isInteger(bib) || bib <= 0) {
          return { ok: false, reason: 'Bib deve ser um número positivo' };
        }
        const bibInUse =
          get().pairs.some((p) => p.eventId === eventId && p.id !== pairId && p.bib === bib) ||
          get().athletes.some(
            (a) => a.eventId === eventId && a.bib === bib && a.pairId !== pairId,
          );
        if (bibInUse) {
          return { ok: false, reason: `Bib #${bib} já está em uso neste evento` };
        }

        set((state) => ({
          pairs: state.pairs.map((p) =>
            p.id === pairId && p.eventId === eventId ? { ...p, bib } : p,
          ),
          athletes: state.athletes.map((a) =>
            a.pairId === pairId && a.eventId === eventId ? { ...a, bib } : a,
          ),
        }));
        syncEvent(eventId);
        return { ok: true };
      },
      updatePairCategory: (eventId, pairId, categoryId) => {
        const auth = assertCanManageAthletes(eventId);
        if (!auth.ok) return auth;

        const pair = get().pairs.find((p) => p.id === pairId && p.eventId === eventId);
        if (!pair) return { ok: false, reason: 'Dupla não encontrada' };

        const category = getCategory(eventId, categoryId);
        if (!category || category.division !== 'Doubles') {
          return { ok: false, reason: 'Selecione uma categoria Doubles' };
        }
        if (pair.categoryId === categoryId) return { ok: true };

        set((state) => ({
          pairs: state.pairs.map((p) =>
            p.id === pairId && p.eventId === eventId ? { ...p, categoryId } : p,
          ),
          athletes: state.athletes.map((a) =>
            a.pairId === pairId && a.eventId === eventId ? { ...a, categoryId } : a,
          ),
        }));
        syncEvent(eventId);
        return { ok: true };
      },
      setParticipantStatus: (eventId, participantId, type, status) => {
        const auth = assertEventAllowsTiming(eventId);
        if (!auth.ok) return auth;

        if (type === 'athlete') {
          const athlete = get().athletes.find((a) => a.id === participantId && a.eventId === eventId);
          if (!athlete) return { ok: false, reason: 'Atleta não encontrado' };
          set((state) => ({
            athletes: state.athletes.map((a) =>
              a.id === participantId && a.eventId === eventId ? { ...a, status } : a,
            ),
          }));
          syncEvent(eventId);
          return { ok: true };
        }

        const pair = get().pairs.find((p) => p.id === participantId && p.eventId === eventId);
        if (!pair) return { ok: false, reason: 'Dupla não encontrada' };
        set((state) => ({
          pairs: state.pairs.map((p) =>
            p.id === participantId && p.eventId === eventId ? { ...p, status } : p,
          ),
          athletes: state.athletes.map((a) =>
            a.pairId === participantId && a.eventId === eventId ? { ...a, status } : a,
          ),
        }));
        syncEvent(eventId);
        return { ok: true };
      },
      recordParticipantFinish: (eventId, participantId, type, totalMs, segmentTimes = []) => {
        const auth = assertEventAllowsTiming(eventId);
        if (!auth.ok) return auth;
        if (totalMs < 0) return { ok: false, reason: 'Tempo inválido' };
        const splits = segmentTimes ?? [];

        if (type === 'athlete') {
          const athlete = get().athletes.find((a) => a.id === participantId && a.eventId === eventId);
          if (!athlete) return { ok: false, reason: 'Atleta não encontrado' };
          set((state) => ({
            athletes: state.athletes.map((a) =>
              a.id === participantId && a.eventId === eventId
                ? { ...a, totalMs, segmentTimes: splits, status: 'finished' as AthleteStatus }
                : a,
            ),
          }));
          syncEvent(eventId);
          return { ok: true };
        }

        const pair = get().pairs.find((p) => p.id === participantId && p.eventId === eventId);
        if (!pair) return { ok: false, reason: 'Dupla não encontrada' };
        set((state) => ({
          pairs: state.pairs.map((p) =>
            p.id === participantId && p.eventId === eventId
              ? { ...p, totalMs, segmentTimes: splits, status: 'finished' as AthleteStatus }
              : p,
          ),
          athletes: state.athletes.map((a) =>
            a.pairId === participantId && a.eventId === eventId
              ? { ...a, totalMs, segmentTimes: splits, status: 'finished' as AthleteStatus }
              : a,
          ),
        }));
        syncEvent(eventId);
        return { ok: true };
      },
      createPair: (eventId, input) => {
        const auth = assertCanAddAthletesToEvent(eventId);
        if (!auth.ok) return auth;

        const category = getCategory(eventId, input.categoryId);
        if (!category || category.division !== 'Doubles') {
          return { ok: false, reason: 'Selecione uma categoria Doubles' };
        }
        if (input.athlete1Id === input.athlete2Id) {
          return { ok: false, reason: 'Selecione dois atletas diferentes' };
        }
        if (!Number.isInteger(input.bib) || input.bib <= 0) {
          return { ok: false, reason: 'Informe um bib válido para a dupla' };
        }
        if (isBibTaken(eventId, input.bib, get().athletes, get().pairs)) {
          return { ok: false, reason: `Bib #${input.bib} já está em uso` };
        }

        const a1 = get().athletes.find((a) => a.id === input.athlete1Id);
        const a2 = get().athletes.find((a) => a.id === input.athlete2Id);
        if (!a1 || !a2 || a1.eventId !== eventId || a2.eventId !== eventId) {
          return { ok: false, reason: 'Atletas não encontrados neste evento' };
        }
        if (a1.categoryId !== input.categoryId || a2.categoryId !== input.categoryId) {
          return { ok: false, reason: 'Ambos devem estar na mesma categoria Doubles' };
        }
        if (a1.pairId || a2.pairId) {
          return { ok: false, reason: 'Um dos atletas já está em outra dupla' };
        }

        const pairId = `pair-${eventId}-${Date.now()}`;
        const pair: DoublesPair = {
          id: pairId,
          eventId,
          categoryId: input.categoryId,
          bib: input.bib,
          athlete1Id: input.athlete1Id,
          athlete2Id: input.athlete2Id,
          teamName: input.teamName?.trim() || undefined,
          status: 'registered',
          totalMs: null,
        };

        set((state) => ({
          pairs: [...state.pairs, pair],
          athletes: state.athletes.map((a) =>
            a.id === input.athlete1Id || a.id === input.athlete2Id
              ? { ...a, pairId, bib: input.bib }
              : a,
          ),
        }));
        syncEvent(eventId);
        return { ok: true };
      },
      addDoublesTeam: (eventId, input) => {
        const auth = assertCanAddAthletesToEvent(eventId);
        if (!auth.ok) return auth;

        const name1 = input.name1.trim();
        const name2 = input.name2.trim();
        if (!name1 || !name2) return { ok: false, reason: 'Informe os dois nomes' };
        if (name1 === name2) return { ok: false, reason: 'Os atletas devem ter nomes diferentes' };

        const ts = Date.now();
        const athlete1: Athlete = {
          id: `ath-${eventId}-${ts}-1`,
          eventId,
          name: name1,
          bib: 0,
          categoryId: input.categoryId,
          pairId: null,
          status: 'registered',
          totalMs: null,
        };
        const athlete2: Athlete = {
          id: `ath-${eventId}-${ts}-2`,
          eventId,
          name: name2,
          bib: 0,
          categoryId: input.categoryId,
          pairId: null,
          status: 'registered',
          totalMs: null,
        };

        set((state) => ({ athletes: [...state.athletes, athlete1, athlete2] }));

        return get().createPair(eventId, {
          categoryId: input.categoryId,
          athlete1Id: athlete1.id,
          athlete2Id: athlete2.id,
          bib: input.bib,
          teamName: input.teamName,
        });
      },
      removePair: (eventId, pairId) => {
        const auth = assertCanManageAthletes(eventId);
        if (!auth.ok) return auth;

        const pair = get().pairs.find((p) => p.id === pairId && p.eventId === eventId);
        if (!pair) return { ok: false, reason: 'Dupla não encontrada' };

        set((state) => ({
          pairs: state.pairs.filter((p) => p.id !== pairId),
          athletes: state.athletes.filter(
            (a) => a.id !== pair.athlete1Id && a.id !== pair.athlete2Id,
          ),
        }));
        syncEvent(eventId);
        return { ok: true };
      },
      dissolvePair: (eventId, pairId) => {
        const auth = assertCanManageAthletes(eventId);
        if (!auth.ok) return auth;

        const pair = get().pairs.find((p) => p.id === pairId && p.eventId === eventId);
        if (!pair) return { ok: false, reason: 'Dupla não encontrada' };

        set((state) => ({
          pairs: state.pairs.filter((p) => p.id !== pairId),
          athletes: state.athletes.map((a) =>
            a.id === pair.athlete1Id || a.id === pair.athlete2Id
              ? { ...a, pairId: null, bib: 0, totalMs: null, status: 'registered' as AthleteStatus }
              : a,
          ),
        }));
        syncEvent(eventId);
        return { ok: true };
      },
    }),
    {
      name: 'hyrox-athletes',
      storage: createJSONStorage(getSafeStorage),
      skipHydration: true,
      partialize: (state) => ({ athletes: state.athletes, pairs: state.pairs }),
      merge: (persisted, current) => {
        const p = persisted as Partial<AthletesState> | undefined;
        return {
          ...current,
          athletes: (p?.athletes ?? current.athletes).map((a) => ({
            ...a,
            pairId: a.pairId ?? null,
            segmentTimes: a.segmentTimes ?? [],
          })),
          pairs: (p?.pairs ?? current.pairs ?? []).map((pair) => ({
            ...pair,
            segmentTimes: pair.segmentTimes ?? [],
          })),
        };
      },
    },
  ),
);

/** Remove atletas/duplas órfãos cujo evento não existe mais */
export function syncAthletesWithEvents(): void {
  const eventIds = new Set(useEventsStore.getState().events.map((e) => e.id));
  useAthletesStore.setState((state) => ({
    athletes: state.athletes.filter((a) => eventIds.has(a.eventId)),
    pairs: state.pairs.filter((p) => eventIds.has(p.eventId)),
  }));
}

export async function hydrateAthletesStore(): Promise<void> {
  if (typeof window === 'undefined') return;
  await useAthletesStore.persist.rehydrate();
}

const EMPTY_ATHLETES: Athlete[] = [];
const EMPTY_PAIRS: DoublesPair[] = [];

export function useAthletesByEvent(eventId: string | undefined): Athlete[] {
  return useAthletesStore(
    useShallow((s) =>
      eventId ? s.athletes.filter((a) => a.eventId === eventId) : EMPTY_ATHLETES,
    ),
  );
}

export function usePairsByEvent(eventId: string | undefined): DoublesPair[] {
  return useAthletesStore(
    useShallow((s) =>
      eventId ? s.pairs.filter((p) => p.eventId === eventId) : EMPTY_PAIRS,
    ),
  );
}

export function useTotalAthletesCount(): number {
  return useAthletesStore((s) => s.athletes.length);
}
