import type { Segment, SegmentTime } from '@/src/domain/types';
import type { TimingParticipant } from '@/src/utils/participantHelpers';
import type { SharedRaceClock } from '@/src/utils/raceClock';

function annotateSegmentTime(
  segmentId: string,
  durationMs: number,
  segments: Segment[],
): SegmentTime {
  const seg = segments.find((s) => s.id === segmentId);
  return {
    segmentId,
    durationMs,
    segmentOrder: seg?.order,
    segmentName: seg?.name,
    segmentType: seg?.type,
  };
}

function upsertAnnotatedSegmentTime(
  times: SegmentTime[],
  segmentId: string,
  durationMs: number,
  segments: Segment[],
): SegmentTime[] {
  const next = annotateSegmentTime(segmentId, durationMs, segments);
  const idx = times.findIndex((st) => st.segmentId === segmentId);
  if (idx < 0) return [...times, next];
  const copy = [...times];
  copy[idx] = next;
  return copy;
}

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

/** Visualização de atleta já finalizado (tempo congelado). */
export function createFinishedTimingRun(
  participant: TimingParticipant,
  totalMs: number,
  segmentTimes: SegmentTime[] = [],
  raceStartedAt?: number,
): TimingRunState {
  const startedAt = raceStartedAt ?? Date.now() - Math.max(0, totalMs);
  return {
    participant: { ...participant, status: 'finished' },
    segmentIndex: segmentTimes.length,
    completed: segmentTimes.map((_, idx) => idx),
    segmentTimes,
    segmentBaseMs: 0,
    segmentStartedAt: null,
    raceStartedAt: startedAt,
    penaltiesMs: 0,
    totalPauseAccumMs: 0,
    totalPausedAt: startedAt + Math.max(0, totalMs),
    raceComplete: true,
    frozenTotalMs: Math.max(0, totalMs),
  };
}

export function isTotalTimePaused(run: TimingRunState): boolean {
  return run.totalPausedAt != null && !run.raceComplete;
}

/** Alinha um cronômetro local ao relógio compartilhado do organizador. */
export function applySharedClockToRun(
  run: TimingRunState,
  clock: SharedRaceClock,
): TimingRunState {
  if (!clock.startedAt) return run;
  const raceStartedAt = new Date(clock.startedAt).getTime();
  if (!Number.isFinite(raceStartedAt)) return run;
  const totalPausedAt = clock.pausedAt ? new Date(clock.pausedAt).getTime() : null;
  const totalPauseAccumMs = clock.pauseAccumMs ?? 0;
  if (
    run.raceStartedAt === raceStartedAt &&
    run.totalPausedAt === totalPausedAt &&
    run.totalPauseAccumMs === totalPauseAccumMs
  ) {
    return run;
  }
  return {
    ...run,
    raceStartedAt,
    totalPausedAt,
    totalPauseAccumMs,
  };
}

/** Aplica só pausa/retomada, sem mudar o start individual da prova. */
export function applySharedPauseToRun(
  run: TimingRunState,
  clock: SharedRaceClock,
): TimingRunState {
  if (run.raceComplete) return run;
  const totalPausedAt = clock.pausedAt ? new Date(clock.pausedAt).getTime() : null;
  const totalPauseAccumMs = clock.pauseAccumMs ?? 0;
  if (run.totalPausedAt === totalPausedAt && run.totalPauseAccumMs === totalPauseAccumMs) {
    return run;
  }
  return {
    ...run,
    totalPausedAt,
    totalPauseAccumMs,
  };
}

export function isCourseFullyCompleted(
  run: TimingRunState,
  segments: { order: number }[],
): boolean {
  if (run.raceComplete || run.participant.status === 'finished') return true;
  if (segments.length === 0) return false;
  if (run.segmentIndex >= segments.length) return true;
  return segments.every((_, idx) => run.completed.includes(idx));
}

/** Congela o cronômetro quando todos os segmentos da prova foram concluídos. */
export function finalizeRunIfCourseComplete(
  run: TimingRunState,
  segments: { order: number }[],
  now = Date.now(),
): TimingRunState {
  if (run.raceComplete) {
    if (run.segmentStartedAt == null && run.frozenTotalMs > 0 && run.totalPausedAt != null) {
      return run;
    }
    return {
      ...run,
      segmentStartedAt: null,
      frozenTotalMs: run.frozenTotalMs || getTotalMs({ ...run, raceComplete: false }, now),
      totalPausedAt: run.totalPausedAt ?? now,
    };
  }
  if (!isCourseFullyCompleted(run, segments)) return run;
  const frozenTotalMs = getTotalMs(run, now);
  return {
    ...run,
    completed: [...new Set([...run.completed, ...segments.map((_, idx) => idx)])].sort(
      (a, b) => a - b,
    ),
    segmentIndex: Math.max(run.segmentIndex, segments.length),
    segmentStartedAt: null,
    raceComplete: true,
    frozenTotalMs,
    totalPausedAt: run.totalPausedAt ?? now,
  };
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
  bib?: number | null;
};

function segmentIdForOrder(segments: { id: string; order: number }[], order: number): string {
  return segments.find((s) => s.order === order)?.id ?? `seg-${order}`;
}

function inferCompletedFromCurrentOrder(
  currentOrder: number | null,
  segments: { order: number; type?: string }[],
): number[] {
  if (currentOrder == null) return [];
  const completed: number[] = [];
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    if (seg.order < currentOrder) completed.push(i);
    else if (seg.order === currentOrder && seg.type === 'station') completed.push(i);
  }
  return completed;
}

/** Reconstrói o cronômetro local a partir do estado na nuvem. */
export function buildTimingRunFromSnapshot(
  participant: TimingParticipant,
  snapshot: LiveRunSnapshot,
  segments: { id: string; order: number; type?: string }[],
): TimingRunState {
  const raceStartedAt = new Date(snapshot.startedAt).getTime();
  const segmentTimes: SegmentTime[] = snapshot.completedSegments.map((s) => ({
    segmentId: segmentIdForOrder(segments, s.segmentOrder),
    durationMs: s.durationMs,
  }));
  const completed = snapshot.completedSegments.length
    ? snapshot.completedSegments.map((s) => {
        const idx = segments.findIndex((seg) => seg.order === s.segmentOrder);
        return idx >= 0 ? idx : Math.max(0, s.segmentOrder - 1);
      })
    : inferCompletedFromCurrentOrder(snapshot.currentSegmentOrder, segments);

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
  if (cloud.raceStartedAt > local.raceStartedAt + 1500) return true;
  if (cloud.raceComplete && !local.raceComplete) return true;
  if (cloud.completed.some((idx) => !local.completed.includes(idx))) return true;
  if (cloud.completed.length > local.completed.length) return true;
  if (cloud.segmentIndex > local.segmentIndex) return true;
  if (localTouchedAtMs && cloudUpdatedAtMs < localTouchedAtMs - 500) return false;
  if (cloud.completed.length < local.completed.length) return false;
  if (cloud.penaltiesMs > local.penaltiesMs) return true;
  const cloudSeg = cloud.segmentStartedAt ?? 0;
  const localSeg = local.segmentStartedAt ?? 0;
  return cloudSeg > localSeg + 300;
}

/** Junta o apontamento da nuvem ao cronômetro local sem perder o relógio. */
export function mergeCloudProgress(local: TimingRunState, cloud: TimingRunState): TimingRunState {
  const completed = [...new Set([...local.completed, ...cloud.completed])].sort((a, b) => a - b);
  const cloudTimes = new Map(cloud.segmentTimes.map((st) => [st.segmentId, st]));
  const segmentTimes = [...local.segmentTimes];
  for (const st of cloud.segmentTimes) {
    if (!segmentTimes.some((localSt) => localSt.segmentId === st.segmentId)) {
      segmentTimes.push(st);
    }
  }
  for (let i = 0; i < segmentTimes.length; i += 1) {
    const cloudSt = cloudTimes.get(segmentTimes[i].segmentId);
    if (cloudSt && cloudSt.durationMs > segmentTimes[i].durationMs) {
      segmentTimes[i] = cloudSt;
    }
  }
  return {
    ...local,
    completed,
    segmentTimes,
    segmentIndex: Math.max(local.segmentIndex, cloud.segmentIndex),
    raceComplete: local.raceComplete || cloud.raceComplete,
    frozenTotalMs: cloud.raceComplete
      ? Math.max(local.frozenTotalMs, cloud.frozenTotalMs)
      : local.frozenTotalMs,
  };
}

export type StationProgressMark = {
  completedOrders: number[];
  currentOrder: number | null;
};

export function stationProgressFromRun(
  run: TimingRunState,
  segments: { order: number }[],
): StationProgressMark {
  const completedOrders = run.completed
    .map((idx) => segments[idx]?.order)
    .filter((order): order is number => typeof order === 'number');
  const currentOrder =
    segments[run.segmentIndex]?.order ?? completedOrders[completedOrders.length - 1] ?? null;
  return { completedOrders, currentOrder };
}

/** Aplica apontamento de estação (por ordem do percurso) no cronômetro local. */
export function applyStationProgressToRun(
  run: TimingRunState,
  progress: StationProgressMark,
  segments: { order: number; type?: string }[],
): TimingRunState {
  if (run.raceComplete) return run;
  const completed = [...run.completed];
  for (const order of progress.completedOrders) {
    const idx = segments.findIndex((s) => s.order === order);
    if (idx >= 0 && !completed.includes(idx)) completed.push(idx);
  }
  let segmentIndex = run.segmentIndex;
  if (progress.currentOrder != null) {
    const idx = segments.findIndex((s) => s.order === progress.currentOrder);
    if (idx >= 0) {
      if (idx > segmentIndex) segmentIndex = idx;
      for (let i = 0; i < idx; i += 1) {
        if (!completed.includes(i)) completed.push(i);
      }
      if (segments[idx]?.type === 'station' && !completed.includes(idx)) {
        completed.push(idx);
      }
    }
  }
  completed.sort((a, b) => a - b);

  const allDone =
    segments.length > 0 &&
    completed.length >= segments.length &&
    segments.every((_, idx) => completed.includes(idx));

  if (allDone) {
    const now = Date.now();
    return {
      ...run,
      completed,
      segmentIndex: segments.length,
      segmentStartedAt: null,
      raceComplete: true,
      frozenTotalMs: run.frozenTotalMs || getTotalMs(run, now),
      totalPausedAt: run.totalPausedAt ?? now,
    };
  }

  if (
    completed.length === run.completed.length &&
    completed.every((idx, i) => idx === run.completed[i]) &&
    segmentIndex === run.segmentIndex
  ) {
    return run;
  }
  return { ...run, completed, segmentIndex };
}

export function applyStationProgressByBib(
  runs: Record<string, TimingRunState>,
  bib: number,
  progress: StationProgressMark,
  segments: { order: number; type?: string }[],
): { next: Record<string, TimingRunState>; changed: boolean } {
  const next = { ...runs };
  let changed = false;
  for (const [key, run] of Object.entries(runs)) {
    if (run.participant.bib !== bib) continue;
    const merged = applyStationProgressToRun(run, progress, segments);
    if (merged !== run) {
      next[key] = merged;
      changed = true;
    }
  }
  return { next, changed };
}

/** Mantém o apontamento local do juiz e alinha o início da prova com a nuvem. */
export function alignRunToOrganizerClock(
  local: TimingRunState,
  cloud: TimingRunState,
): TimingRunState {
  return {
    ...local,
    raceStartedAt: cloud.raceStartedAt,
    totalPausedAt: cloud.totalPausedAt,
    totalPauseAccumMs: cloud.totalPauseAccumMs,
    penaltiesMs: Math.max(local.penaltiesMs, cloud.penaltiesMs),
  };
}

export function advanceSegment(
  run: TimingRunState,
  segmentId: string,
  now: number,
  segments: Segment[],
): TimingRunState {
  if (run.raceComplete) return run;

  const durationMs = getSegmentMs(run, now);
  const segmentTimes =
    durationMs > 0
      ? upsertAnnotatedSegmentTime(run.segmentTimes, segmentId, durationMs, segments)
      : run.segmentTimes;
  const completed = [...run.completed, run.segmentIndex];

  const nextIndex = run.segmentIndex + 1;
  const totalSegments = segments.length;

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
      totalPausedAt: run.totalPausedAt ?? now,
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
function withStationArrival(
  run: TimingRunState,
  segments: Segment[],
  stationIdx: number,
  runIdx: number | null,
  now: number,
): TimingRunState {
  const station = segments[stationIdx];
  const completed = [...run.completed];
  let segmentTimes = [...run.segmentTimes];

  if (runIdx != null && !completed.includes(runIdx)) {
    const runSegment = segments[runIdx];
    const alreadyRecorded = run.segmentTimes.reduce((sum, st) => sum + st.durationMs, 0);
    const intervalMs = Math.max(0, getTotalMs(run, now) - alreadyRecorded);
    const durationMs =
      run.segmentIndex === runIdx ? getSegmentMs(run, now) : intervalMs;
    if (runSegment && durationMs > 0) {
      segmentTimes = upsertAnnotatedSegmentTime(
        segmentTimes,
        runSegment.id,
        durationMs,
        segments,
      );
    }
    completed.push(runIdx);
  }

  if (station && !segmentTimes.some((st) => st.segmentId === station.id)) {
    segmentTimes = upsertAnnotatedSegmentTime(segmentTimes, station.id, 0, segments);
  }
  if (!completed.includes(stationIdx)) completed.push(stationIdx);

  return {
    ...run,
    segmentTimes,
    completed,
    segmentIndex: stationIdx,
    segmentBaseMs: 0,
    segmentStartedAt: now,
  };
}

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
  if (run.segmentIndex > stationIdx) return null;

  const runIdx = runIndexBeforeStation(segments, stationOrder);
  return withStationArrival(run, segments, stationIdx, runIdx, now);
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
    durationMs > 0
      ? upsertAnnotatedSegmentTime(run.segmentTimes, segmentId, durationMs, segments)
      : run.segmentTimes;
  const completed = run.completed.includes(run.segmentIndex)
    ? run.completed
    : [...run.completed, run.segmentIndex];
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
      totalPausedAt: run.totalPausedAt ?? now,
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
