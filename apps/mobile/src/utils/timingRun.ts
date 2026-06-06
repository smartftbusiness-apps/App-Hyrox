import type { SegmentTime } from '@/src/domain/types';
import type { TimingParticipant } from '@/src/utils/participantHelpers';

export type TimingRunState = {
  participant: TimingParticipant;
  segmentIndex: number;
  completed: number[];
  segmentTimes: SegmentTime[];
  /** Ms acumulados no segmento atual (antes do trecho em andamento). */
  segmentBaseMs: number;
  /** Quando o segmento atual começou a contar; null = pausado pelo juiz. */
  segmentStartedAt: number | null;
  /** Início da prova (tempo total). */
  raceStartedAt: number;
  penaltiesMs: number;
  /** Prova concluída — aguardando salvar. */
  raceComplete: boolean;
  frozenTotalMs: number;
};

export function participantKey(p: Pick<TimingParticipant, 'id' | 'type'>): string {
  return `${p.type}:${p.id}`;
}

export function createTimingRun(participant: TimingParticipant): TimingRunState {
  const now = Date.now();
  return {
    participant,
    segmentIndex: 0,
    completed: [],
    segmentTimes: [],
    segmentBaseMs: 0,
    segmentStartedAt: now,
    raceStartedAt: now,
    penaltiesMs: 0,
    raceComplete: false,
    frozenTotalMs: 0,
  };
}

export function isSegmentRunning(run: TimingRunState): boolean {
  return run.segmentStartedAt != null && !run.raceComplete;
}

export function getSegmentMs(run: TimingRunState, now: number): number {
  if (!run.segmentStartedAt) return run.segmentBaseMs;
  return run.segmentBaseMs + (now - run.segmentStartedAt);
}

export function getTotalMs(run: TimingRunState, now: number): number {
  if (run.raceComplete) return run.frozenTotalMs;
  return now - run.raceStartedAt + run.penaltiesMs;
}

export function pauseSegment(run: TimingRunState, now: number): TimingRunState {
  if (!run.segmentStartedAt || run.raceComplete) return run;
  return {
    ...run,
    segmentBaseMs: getSegmentMs(run, now),
    segmentStartedAt: null,
  };
}

export function resumeSegment(run: TimingRunState, now: number): TimingRunState {
  if (run.raceComplete || run.segmentStartedAt) return run;
  return { ...run, segmentStartedAt: now };
}

export function toggleSegmentRun(run: TimingRunState, now: number): TimingRunState {
  return isSegmentRunning(run) ? pauseSegment(run, now) : resumeSegment(run, now);
}

export function addPenalty(run: TimingRunState): TimingRunState {
  if (run.raceComplete) return run;
  return { ...run, penaltiesMs: run.penaltiesMs + 120_000 };
}

export function advanceSegment(
  run: TimingRunState,
  segmentId: string,
  now: number,
  totalSegments: number,
): TimingRunState {
  if (run.raceComplete) return run;

  const durationMs = getSegmentMs(run, now);
  const segmentTimes =
    durationMs > 0 ? [...run.segmentTimes, { segmentId, durationMs }] : run.segmentTimes;
  const completed = [...run.completed, run.segmentIndex];
  const nextIndex = run.segmentIndex + 1;

  if (nextIndex >= totalSegments) {
    return {
      ...run,
      segmentTimes,
      completed,
      segmentIndex: nextIndex,
      segmentBaseMs: 0,
      segmentStartedAt: null,
      raceComplete: true,
      frozenTotalMs: getTotalMs(run, now),
    };
  }

  return {
    ...run,
    segmentTimes,
    completed,
    segmentIndex: nextIndex,
    segmentBaseMs: 0,
    segmentStartedAt: now,
  };
}
