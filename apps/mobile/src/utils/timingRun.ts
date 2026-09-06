import type { Segment, SegmentTime } from '@/src/domain/types';
import type { TimingParticipant } from '@/src/utils/participantHelpers';

function runIndexBeforeStation(segments: Segment[], stationOrder: number): number | null {
  const stationIdx = segments.findIndex((s) => s.order === stationOrder && s.type === 'station');
  if (stationIdx <= 0) return null;
  const prev = segments[stationIdx - 1];
  return prev?.type === 'run' ? stationIdx - 1 : null;
}

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
  /** Tempo total pausado acumulado (ms). */
  totalPauseAccumMs: number;
  /** Quando a pausa do tempo total começou; null = contando. */
  totalPausedAt: number | null;
  /** Prova concluída — aguardando salvar. */
  raceComplete: boolean;
  frozenTotalMs: number;
};

export function participantKey(p: Pick<TimingParticipant, 'id' | 'type'>): string {
  return `${p.type}:${p.id}`;
}

export function createTimingRun(participant: TimingParticipant): TimingRunState {
  return createTimingRunAt(participant, Date.now());
}

export function createTimingRunAt(
  participant: TimingParticipant,
  raceStartedAt: number,
): TimingRunState {
  return createHeatTimingRun(participant, raceStartedAt, []);
}

/** Início de bateria/prova: todos seguem a ordem do percurso a partir do segmento 1. */
export function createHeatTimingRun(
  participant: TimingParticipant,
  raceStartedAt: number,
  segments: Segment[],
): TimingRunState {
  const firstSegment = segments[0];
  const firstIsRun = firstSegment?.type === 'run';
  return {
    participant,
    segmentIndex: 0,
    completed: [],
    segmentTimes: [],
    segmentBaseMs: 0,
    segmentStartedAt: firstIsRun ? raceStartedAt : null,
    raceStartedAt,
    penaltiesMs: 0,
    totalPauseAccumMs: 0,
    totalPausedAt: null,
    raceComplete: false,
    frozenTotalMs: 0,
  };
}

/** Juiz só observa a prova: nenhum relógio corre até registrar chegada na estação. */
export function createJudgeStationWatchRun(
  participant: TimingParticipant,
  raceStartedAt: number,
): TimingRunState {
  return {
    participant,
    segmentIndex: 0,
    completed: [],
    segmentTimes: [],
    segmentBaseMs: 0,
    segmentStartedAt: null,
    raceStartedAt,
    penaltiesMs: 0,
    totalPauseAccumMs: 0,
    totalPausedAt: null,
    raceComplete: false,
    frozenTotalMs: 0,
  };
}

export function isTotalTimePaused(run: TimingRunState): boolean {
  return run.totalPausedAt != null && !run.raceComplete;
}

export function getTotalMs(run: TimingRunState, now: number): number {
  if (run.raceComplete) return run.frozenTotalMs;
  const clockNow = run.totalPausedAt ?? now;
  return clockNow - run.raceStartedAt - run.totalPauseAccumMs + run.penaltiesMs;
}

export function isSegmentRunning(run: TimingRunState): boolean {
  return run.segmentStartedAt != null && !run.raceComplete;
}

export function getSegmentMs(run: TimingRunState, now: number): number {
  const clockNow = run.totalPausedAt ?? now;
  if (!run.segmentStartedAt) return run.segmentBaseMs;
  return run.segmentBaseMs + (clockNow - run.segmentStartedAt);
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

export function pauseTotalTime(run: TimingRunState, now: number): TimingRunState {
  if (run.raceComplete || run.totalPausedAt != null) return run;
  const withSegment = isSegmentRunning(run) ? pauseSegment(run, now) : run;
  return { ...withSegment, totalPausedAt: now };
}

export function resumeTotalTime(run: TimingRunState, now: number): TimingRunState {
  if (run.raceComplete || run.totalPausedAt == null) return run;
  const pauseDuration = now - run.totalPausedAt;
  let next: TimingRunState = {
    ...run,
    totalPauseAccumMs: run.totalPauseAccumMs + pauseDuration,
    totalPausedAt: null,
  };
  if (next.segmentBaseMs > 0 && !isSegmentRunning(next)) {
    next = resumeSegment(next, now);
  }
  return next;
}

export function toggleTotalTimePause(run: TimingRunState, now: number): TimingRunState {
  return isTotalTimePaused(run) ? resumeTotalTime(run, now) : pauseTotalTime(run, now);
}

export function addPenalty(run: TimingRunState): TimingRunState {
  if (run.raceComplete) return run;
  return { ...run, penaltiesMs: run.penaltiesMs + 120_000 };
}

export type LiveCompletedSegment = {
  segmentOrder: number;
  durationMs: number;
};

export type LiveRunSnapshot = {
  participantKind: 'athlete' | 'pair';
  participantDbId: string;
  runId: string;
  startedAt: string;
  currentSegmentOrder: number | null;
  currentSegmentStartedAt: string | null;
  penaltiesMs: number;
  liveCompleteAt: string | null;
  completedSegments: LiveCompletedSegment[];
  updatedAt: string;
};

function segmentIdForOrder(segments: { id: string; order: number }[], order: number): string {
  return segments.find((s) => s.order === order)?.id ?? `seg-${order}`;
}

/** Reconstrói o cronômetro local a partir do estado na nuvem. */
export function buildTimingRunFromSnapshot(
  participant: TimingParticipant,
  snapshot: LiveRunSnapshot,
  segments: { id: string; order: number }[],
): TimingRunState {
  const raceStartedAt = new Date(snapshot.startedAt).getTime();
  const segmentTimes: SegmentTime[] = snapshot.completedSegments.map((s) => ({
    segmentId: segmentIdForOrder(segments, s.segmentOrder),
    durationMs: s.durationMs,
  }));
  const completed = snapshot.completedSegments.map((s) => {
    const idx = segments.findIndex((seg) => seg.order === s.segmentOrder);
    return idx >= 0 ? idx : Math.max(0, s.segmentOrder - 1);
  });

  const raceComplete = !!snapshot.liveCompleteAt;
  let segmentIndex = completed.length;
  if (!raceComplete && snapshot.currentSegmentOrder != null) {
    const idx = segments.findIndex((s) => s.order === snapshot.currentSegmentOrder);
    segmentIndex = idx >= 0 ? idx : Math.max(0, snapshot.currentSegmentOrder - 1);
  } else if (raceComplete) {
    segmentIndex = segments.length;
  }

  const segmentStartedAt =
    raceComplete || !snapshot.currentSegmentStartedAt
      ? null
      : new Date(snapshot.currentSegmentStartedAt).getTime();

  const frozenTotalMs =
    raceComplete && snapshot.liveCompleteAt
      ? new Date(snapshot.liveCompleteAt).getTime() - raceStartedAt + snapshot.penaltiesMs
      : 0;

  return {
    participant,
    segmentIndex,
    completed,
    segmentTimes,
    segmentBaseMs: 0,
    segmentStartedAt,
    raceStartedAt,
    penaltiesMs: snapshot.penaltiesMs,
    totalPauseAccumMs: 0,
    totalPausedAt: null,
    raceComplete,
    frozenTotalMs,
  };
}

export function isCloudTimingAhead(
  local: TimingRunState | undefined,
  cloud: TimingRunState,
  cloudUpdatedAtMs: number,
  localTouchedAtMs: number | undefined,
): boolean {
  if (!local) return true;
  if (localTouchedAtMs && cloudUpdatedAtMs < localTouchedAtMs - 500) return false;
  if (local.totalPausedAt != null && cloud.totalPausedAt == null) return false;
  if (local.totalPauseAccumMs > cloud.totalPauseAccumMs) return false;
  if (cloud.completed.length > local.completed.length) return true;
  if (cloud.raceComplete && !local.raceComplete) return true;
  if (cloud.penaltiesMs > local.penaltiesMs) return true;
  if (cloud.completed.length < local.completed.length) return false;
  if (cloud.segmentIndex > local.segmentIndex) return true;
  const cloudSeg = cloud.segmentStartedAt ?? 0;
  const localSeg = local.segmentStartedAt ?? 0;
  return cloudSeg > localSeg + 300;
}

/** Mantém o apontamento local do juiz e alinha o início da prova com a nuvem. */
export function alignRunToOrganizerClock(
  local: TimingRunState,
  cloud: TimingRunState,
): TimingRunState {
  return {
    ...local,
    raceStartedAt: cloud.raceStartedAt,
    penaltiesMs: Math.max(local.penaltiesMs, cloud.penaltiesMs),
  };
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

/**
 * Juiz registra chegada na estação: salva tempo da corrida (intervalo) e inicia o WOD.
 */
export function receiveAthleteAtStation(
  run: TimingRunState,
  segments: Segment[],
  stationOrder: number,
  now: number,
): TimingRunState | null {
  if (run.raceComplete) return null;

  const stationIdx = segments.findIndex(
    (s) => s.order === stationOrder && s.type === 'station',
  );
  if (stationIdx < 0) return null;

  const runIdx = runIndexBeforeStation(segments, stationOrder);

  if (run.segmentIndex === stationIdx && !isSegmentRunning(run)) {
    return { ...run, segmentBaseMs: 0, segmentStartedAt: now };
  }

  if (run.segmentIndex > stationIdx) return null;

  const elapsedOnRace = getTotalMs(run, now);
  const alreadyRecorded = run.segmentTimes.reduce((sum, st) => sum + st.durationMs, 0);
  const intervalMs = Math.max(0, elapsedOnRace - alreadyRecorded);

  if (runIdx != null && !run.completed.includes(runIdx)) {
    const runSegment = segments[runIdx];
    const durationMs =
      run.segmentIndex === runIdx ? getSegmentMs(run, now) : intervalMs;
    const segmentTimes =
      durationMs > 0
        ? [...run.segmentTimes, { segmentId: runSegment.id, durationMs }]
        : run.segmentTimes;
    const completed = [...run.completed, runIdx];
    return {
      ...run,
      segmentTimes,
      completed,
      segmentIndex: stationIdx,
      segmentBaseMs: 0,
      segmentStartedAt: now,
    };
  }

  return {
    ...run,
    segmentIndex: stationIdx,
    segmentBaseMs: 0,
    segmentStartedAt: now,
  };
}

/**
 * Juiz encaminha atleta após o WOD: salva estação e inicia intervalo de corrida até a próxima.
 */
export function releaseAthleteFromStation(
  run: TimingRunState,
  segmentId: string,
  segments: Segment[],
  now: number,
): TimingRunState {
  if (run.raceComplete) return run;

  const durationMs = getSegmentMs(run, now);
  const segmentTimes =
    durationMs > 0 ? [...run.segmentTimes, { segmentId, durationMs }] : run.segmentTimes;
  const completed = [...run.completed, run.segmentIndex];
  const nextIndex = run.segmentIndex + 1;

  if (nextIndex >= segments.length) {
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

  const nextSegment = segments[nextIndex];
  return {
    ...run,
    segmentTimes,
    completed,
    segmentIndex: nextIndex,
    segmentBaseMs: 0,
    segmentStartedAt: nextSegment?.type === 'run' ? now : null,
  };
}
