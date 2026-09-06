export type SharedRaceClock = {
  startedAt: string | null;
  pausedAt: string | null;
  pauseAccumMs: number;
};

export function emptyRaceClock(): SharedRaceClock {
  return { startedAt: null, pausedAt: null, pauseAccumMs: 0 };
}

export function clockFromEvent(event?: {
  raceStartedAt?: string | null;
  racePausedAt?: string | null;
  racePauseAccumMs?: number;
} | null): SharedRaceClock {
  return {
    startedAt: event?.raceStartedAt ?? null,
    pausedAt: event?.racePausedAt ?? null,
    pauseAccumMs: event?.racePauseAccumMs ?? 0,
  };
}

export function isSharedRacePaused(clock: SharedRaceClock): boolean {
  return !!clock.startedAt && !!clock.pausedAt;
}

export function getSharedRaceMs(clock: SharedRaceClock, now: number): number | null {
  if (!clock.startedAt) return null;
  const startedAt = new Date(clock.startedAt).getTime();
  if (!Number.isFinite(startedAt)) return null;
  const end = clock.pausedAt ? new Date(clock.pausedAt).getTime() : now;
  if (!Number.isFinite(end)) return null;
  return Math.max(0, end - startedAt - (clock.pauseAccumMs ?? 0));
}

export function startRaceClock(at = Date.now()): SharedRaceClock {
  return { startedAt: new Date(at).toISOString(), pausedAt: null, pauseAccumMs: 0 };
}

export function pauseRaceClock(clock: SharedRaceClock, now = Date.now()): SharedRaceClock {
  if (!clock.startedAt || clock.pausedAt) return clock;
  return { ...clock, pausedAt: new Date(now).toISOString() };
}

export function resumeRaceClock(clock: SharedRaceClock, now = Date.now()): SharedRaceClock {
  if (!clock.startedAt || !clock.pausedAt) return clock;
  const pausedAt = new Date(clock.pausedAt).getTime();
  return {
    ...clock,
    pausedAt: null,
    pauseAccumMs: (clock.pauseAccumMs ?? 0) + Math.max(0, now - pausedAt),
  };
}

export function clocksEqual(a: SharedRaceClock, b: SharedRaceClock): boolean {
  return (
    a.startedAt === b.startedAt &&
    a.pausedAt === b.pausedAt &&
    (a.pauseAccumMs ?? 0) === (b.pauseAccumMs ?? 0)
  );
}
