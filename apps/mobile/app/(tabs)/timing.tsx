import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { SegmentProgress } from '@/components/SegmentProgress';
import { TimerDisplay } from '@/components/TimerDisplay';
import { HyroxTheme } from '@/constants/Theme';
import type { HyroxEvent } from '@/src/domain/types';
import { useAthletesByEvent, useAthletesStore, usePairsByEvent } from '@/src/stores/athletesStore';
import { useEventStaffStore } from '@/src/stores/eventStaffStore';
import { useStationMarksStore } from '@/src/stores/stationMarksStore';
import { useEvents, useEventsStore } from '@/src/stores/eventsStore';
import { useOrganizerStore } from '@/src/stores/organizerStore';
import {
  assignedParticipantsForHeat,
  buildTimingParticipants,
  isParticipantRaceStarted,
  remapHeatRostersToLocalParticipants,
  type TimingParticipant,
} from '@/src/utils/participantHelpers';
import { formatMs, formatStatusLabel } from '@/src/utils/formatTime';
import {
  buildRunsFromSnapshots,
  fetchLiveStationProgress,
  fetchLiveTimingSnapshots,
  pushTimingRunState,
  startLiveRunInCloud,
  subscribeEventLiveClock,
} from '@/src/api/liveTimingRepository';
import { persistEventRaceClock } from '@/src/api/eventsRepository';
import { pullAndMergeJudgeEvents, pushEventToSupabase, syncJudgeEventLive } from '@/src/api/syncService';
import {
  clockFromEvent,
  getSharedRaceMs,
  isSharedRacePaused,
  pauseRaceClock,
  resumeRaceClock,
  startRaceClock,
} from '@/src/utils/raceClock';
import { isSupabaseConfigured } from '@/src/lib/supabase';
import { localIdFromDb } from '@/src/api/repositoryTypes';
import { useIsJudgeMode } from '@/src/stores/accessModeStore';
import { useAuthStore } from '@/src/stores/authStore';
import { useIsEventOwner } from '@/src/hooks/useEvent';
import {
  advanceSegment,
  alignRunToOrganizerClock,
  applyStationProgressByBib,
  mergeCloudProgress,
  createHeatTimingRun,
  createJudgeStationWatchRun,
  createFinishedTimingRun,
  ensureFinishSegmentTimes,
  finalizeRunIfCourseComplete,
  applySharedPauseToRun,
  getSegmentMs,
  getTotalMs,
  isCloudTimingAhead,
  isSegmentRunning,
  isTotalTimePaused,
  participantKey,
  receiveAthleteAtStation,
  releaseAthleteFromStation,
  toggleSegmentRun,
  type TimingRunState,
} from '@/src/utils/timingRun';
import {
  getJudgeStationActions,
  isParticipantApproachingStation,
  isParticipantAtStation,
  hasCompletedJudgeStation,
  isParticipantVisibleToJudge,
  stationLabel,
} from '@/src/utils/stationTiming';

function applyAllStationProgress(
  runs: Record<string, TimingRunState>,
  progress: Record<string, { completedOrders: number[]; currentOrder: number | null }> | undefined,
  segments: { order: number; type?: string }[],
): { next: Record<string, TimingRunState>; changed: boolean } {
  if (!progress) return { next: runs, changed: false };
  let next = runs;
  let changed = false;
  for (const [bib, mark] of Object.entries(progress)) {
    const applied = applyStationProgressByBib(next, Number(bib), mark, segments);
    if (applied.changed) {
      next = applied.next;
      changed = true;
    }
  }
  return { next, changed };
}

function isJudgeAssignedToEvent(
  event: HyroxEvent,
  assignedEventIds: string[],
  judgeStationByEvent: Record<string, number | null>,
): boolean {
  if (assignedEventIds.includes(event.id)) return true;
  if (event.supabaseId) {
    if (assignedEventIds.includes(event.supabaseId)) return true;
    if (assignedEventIds.includes(localIdFromDb('evt', event.supabaseId))) return true;
  }
  return Object.prototype.hasOwnProperty.call(judgeStationByEvent, event.id);
}

export default function TimingScreen() {
  const { width } = useWindowDimensions();
  const isJudgeMode = useIsJudgeMode();
  const authUserId = useAuthStore((s) => s.user?.id);
  const assignedEventIds = useEventStaffStore((s) => s.assignedEventIds);
  const judgeStations = useEventStaffStore((s) => s.judgeStationByEvent);
  const isEventOwner = useOrganizerStore((s) => s.isEventOwner);
  const contentWidth = Math.min(width, 720);
  const narrow = contentWidth < 380;
  const compact = contentWidth < 420;
  const wide = contentWidth >= 720;
  const events = useEvents();
  const markHeatStarted = useEventsStore((s) => s.markHeatStarted);
  const setRaceClock = useEventsStore((s) => s.setRaceClock);
  const updateEventStatus = useEventsStore((s) => s.updateEventStatus);
  const timingEvents = useMemo(() => {
    const list = events.filter((e) => {
      if (isJudgeMode) {
        if (!isJudgeAssignedToEvent(e, assignedEventIds, judgeStations)) return false;
        return true;
      }
      if (!isEventOwner(e.organizerId)) return false;
      return e.status === 'live' || e.status === 'open';
    });
    return list;
  }, [events, isJudgeMode, assignedEventIds, judgeStations, isEventOwner]);

  const params = useLocalSearchParams<{
    eventId?: string | string[];
    participantKey?: string | string[];
  }>();
  const paramEventId = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId;
  const paramParticipantKey = Array.isArray(params.participantKey)
    ? params.participantKey[0]
    : params.participantKey;
  const [pickedEventId, setPickedEventId] = useState<string | null>(paramEventId ?? null);

  useEffect(() => {
    if (!paramEventId) return;
    const match = events.find((e) => e.id === paramEventId || e.supabaseId === paramEventId);
    setPickedEventId(match?.id ?? paramEventId);
  }, [paramEventId, events]);
  const [search, setSearch] = useState('');
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [runs, setRuns] = useState<Record<string, TimingRunState>>({});
  const [now, setNow] = useState(Date.now());
  const [liveTick, setLiveTick] = useState(0);
  const localTouchedAtRef = useRef<Record<string, number>>({});
  const lastRaceStartByEventRef = useRef<Record<string, string>>({});
  const finishedFreezeRef = useRef<Record<string, string>>({});
  const savedRankingKeysRef = useRef<Set<string>>(new Set());
  const timerPanelRef = useRef<View>(null);

  const setParticipantStatus = useAthletesStore((s) => s.setParticipantStatus);
  const recordParticipantFinish = useAthletesStore((s) => s.recordParticipantFinish);

  const eventId = pickedEventId ?? '';
  const selectedEvent = eventId
    ? (events.find((e) => e.id === eventId || e.supabaseId === eventId) ??
      timingEvents.find((e) => e.id === eventId || e.supabaseId === eventId))
    : undefined;
  const eventFinished = selectedEvent?.status === 'finished';
  const raceClock = clockFromEvent(selectedEvent);
  const displayClock =
    eventFinished && raceClock.startedAt && !raceClock.pausedAt
      ? {
          ...raceClock,
          pausedAt:
            finishedFreezeRef.current[eventId] ??
            (finishedFreezeRef.current[eventId] = new Date().toISOString()),
        }
      : raceClock;
  const racePaused = isSharedRacePaused(displayClock) || eventFinished;
  const isOrganizer = !isJudgeMode && useIsEventOwner(selectedEvent);
  const isAssignedJudge = useEventStaffStore((s) =>
    eventId ? s.isAssignedJudge(eventId) : false,
  );
  const isJudgeView =
    isJudgeMode &&
    !!selectedEvent &&
    (isAssignedJudge || isJudgeAssignedToEvent(selectedEvent, assignedEventIds, judgeStations));
  const judgeStationOrder = useEventStaffStore((s) =>
    eventId ? s.judgeStationByEvent[eventId] : undefined,
  );
  const stationMarked = useStationMarksStore((s) => s.marked);
  const markStationDone = useStationMarksStore((s) => s.markStation);
  const isStationMarkedAfter = useStationMarksStore((s) => s.isMarkedAfter);
  const clearEventStationMarks = useStationMarksStore((s) => s.clearEvent);
  const clearParticipantStationMarks = useStationMarksStore((s) => s.clearParticipants);
  const athletes = useAthletesByEvent(eventId || undefined);
  const pairs = usePairsByEvent(eventId || undefined);

  const participants = useMemo(() => {
    if (!selectedEvent) return [];
    return buildTimingParticipants(athletes, pairs, selectedEvent.categories);
  }, [athletes, pairs, selectedEvent]);

  const segments = selectedEvent?.segments ?? [];
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;

  const runList = useMemo(() => {
    let list = Object.values(runs);
    if (isJudgeView && judgeStationOrder != null) {
      list = list.filter((run) => {
        const key = participantKey(run.participant);
        if (isStationMarkedAfter(eventId, judgeStationOrder, key, run.raceStartedAt)) {
          return false;
        }
        return isParticipantVisibleToJudge(run, segments, judgeStationOrder);
      });
    }
    return list.sort((a, b) => a.participant.bib - b.participant.bib);
  }, [runs, isJudgeView, judgeStationOrder, segments, eventId, stationMarked, isStationMarkedAfter]);

  useEffect(() => {
    if (!pickedEventId || !selectedEvent) return;
    if (isJudgeView && !raceClock.startedAt) return;
    const heats = selectedEvent.heats ?? [];
    setRuns((prev) => {
      const next = { ...prev };
      let changed = false;
      const seedParticipant = (participant: TimingParticipant, startedIso: string) => {
        if (
          participant.status === 'finished' ||
          participant.status === 'dnf' ||
          participant.status === 'dns'
        ) {
          return;
        }
        const key = participantKey(participant);
        if (next[key]) return;
        const startedAt = new Date(startedIso).getTime();
        if (Number.isNaN(startedAt)) return;
        next[key] = applySharedPauseToRun(
          isJudgeView
            ? createJudgeStationWatchRun(participant, startedAt)
            : createHeatTimingRun(participant, startedAt, segments),
          raceClock,
        );
        changed = true;
      };

      for (const participant of participants) {
        const startedIso = participant.racingStartedAt ?? raceClock.startedAt;
        if (!startedIso) continue;
        if (participant.status !== 'racing' && !participant.racingStartedAt) continue;
        seedParticipant(participant, startedIso);
      }

      for (const heat of heats) {
        if (!heat.startedAt) continue;
        for (const participant of assignedParticipantsForHeat(participants, heat)) {
          const startedIso =
            participant.racingStartedAt ?? heat.startedAt ?? raceClock.startedAt;
          if (!startedIso) continue;
          seedParticipant(participant, startedIso);
        }
      }

      return changed ? next : prev;
    });
  }, [
    pickedEventId,
    selectedEvent,
    participants,
    segments,
    isJudgeView,
    raceClock.startedAt,
    raceClock.pausedAt,
    raceClock.pauseAccumMs,
  ]);

  const judgeRosterParticipants = useMemo(() => {
    const heats = selectedEvent?.heats ?? [];
    return participants.filter((p) => {
      if (p.status === 'finished' || p.status === 'dnf' || p.status === 'dns') return false;
      if (!isParticipantRaceStarted(p, participants, heats, raceClock.startedAt)) return false;
      const key = participantKey(p);
      const run = runs[key];
      const startedAtMs =
        run?.raceStartedAt ??
        (p.racingStartedAt ? new Date(p.racingStartedAt).getTime() : null);
      if (
        judgeStationOrder != null &&
        isStationMarkedAfter(eventId, judgeStationOrder, key, startedAtMs)
      ) {
        return false;
      }
      if (
        run &&
        judgeStationOrder != null &&
        hasCompletedJudgeStation(run, segments, judgeStationOrder)
      ) {
        return false;
      }
      return true;
    });
  }, [
    participants,
    runs,
    judgeStationOrder,
    eventId,
    segments,
    stationMarked,
    isStationMarkedAfter,
    raceClock.startedAt,
    selectedEvent?.heats,
  ]);

  const activeRun = useMemo(
    () =>
      activeKey
        ? runList.find((r) => participantKey(r.participant) === activeKey)
        : undefined,
    [activeKey, runList],
  );
  const activeParticipant = activeRun?.participant;

  const availableParticipants = useMemo(() => {
    const q = search.toLowerCase().trim();
    return participants.filter((p) => {
      const key = participantKey(p);
      if (runs[key] || p.status === 'racing') return false;
      if (p.status === 'finished') return false;
      if (!q) return true;
      return (
        p.label.toLowerCase().includes(q) ||
        String(p.bib).includes(q) ||
        p.memberNames.some((n) => n.toLowerCase().includes(q))
      );
    });
  }, [participants, runs, search]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const keys = Object.keys(runs);
    if (keys.length === 0) {
      setActiveKey(null);
      return;
    }
    setActiveKey((current) => (current && runs[current] ? current : keys[0]));
  }, [runs]);

  useEffect(() => {
    if (!isJudgeMode || !authUserId) return;
    void pullAndMergeJudgeEvents(authUserId);
  }, [isJudgeMode, authUserId]);

  useEffect(() => {
    if (!pickedEventId || !isJudgeView || !eventId || !selectedEvent?.supabaseId) return;
    void syncJudgeEventLive(eventId);
  }, [pickedEventId, isJudgeView, eventId, selectedEvent?.supabaseId]);

  useEffect(() => {
    if (!pickedEventId || !eventId || !isOrganizer || !selectedEvent?.supabaseId) return;
    void pushEventToSupabase(eventId);
  }, [pickedEventId, eventId, isOrganizer, selectedEvent?.supabaseId]);

  useEffect(() => {
    if (!pickedEventId || !eventId || !isSupabaseConfigured() || !selectedEvent) return;

    const syncLive = async () => {
      if (isJudgeView) {
        await syncJudgeEventLive(eventId);
        const liveEvent = useEventsStore.getState().events.find((e) => e.id === eventId);
        const liveClock = clockFromEvent(liveEvent);

        const snapshots = await fetchLiveTimingSnapshots(eventId);
        const cloudRuns = snapshots.length
          ? buildRunsFromSnapshots(snapshots, eventId, participants, segments)
          : new Map();
        const stationProgress = selectedEvent.supabaseId
          ? await fetchLiveStationProgress(selectedEvent.supabaseId)
          : (selectedEvent.liveStationProgress ?? {});

        setRuns((prev) => {
          let next = { ...prev };
          let changed = false;
          for (const [key, { run: cloudRun, updatedAt }] of cloudRuns) {
            if (cloudRun.participant.status === 'finished') continue;
            const local = prev[key];
            const cloudUpdatedAt = new Date(updatedAt).getTime();
            if (
              isCloudTimingAhead(local, cloudRun, cloudUpdatedAt, localTouchedAtRef.current[key])
            ) {
              next[key] = applySharedPauseToRun(
                local ? mergeCloudProgress(local, cloudRun) : cloudRun,
                liveClock,
              );
              changed = true;
              continue;
            }
            if (local && local.raceStartedAt !== cloudRun.raceStartedAt) {
              next[key] = applySharedPauseToRun(
                alignRunToOrganizerClock(local, cloudRun),
                liveClock,
              );
              changed = true;
            }
          }
          if (liveClock.startedAt) {
            for (const key of Object.keys(next)) {
              const aligned = applySharedPauseToRun(next[key], liveClock);
              if (aligned !== next[key]) {
                next[key] = aligned;
                changed = true;
              }
            }
          }
          const withProgress = applyAllStationProgress(
            next,
            { ...liveEvent?.liveStationProgress, ...stationProgress },
            segments,
          );
          if (withProgress.changed) {
            next = withProgress.next;
            changed = true;
          }
          for (const participant of participants) {
            if (!liveClock.startedAt) break;
            const clockIso = participant.racingStartedAt ?? liveClock.startedAt;
            if (!clockIso) continue;
            if (participant.status === 'finished' || participant.status === 'dnf' || participant.status === 'dns') {
              continue;
            }
            const heats = liveEvent?.heats ?? selectedEvent.heats ?? [];
            if (
              !isParticipantRaceStarted(
                participant,
                participants,
                heats,
                liveClock.startedAt,
              )
            ) {
              continue;
            }
            const key = participantKey(participant);
            const startedAtMs = next[key]?.raceStartedAt
              ?? (clockIso ? new Date(clockIso).getTime() : null);
            if (
              judgeStationOrder != null &&
              isStationMarkedAfter(eventId, judgeStationOrder, key, startedAtMs)
            ) {
              if (next[key]) {
                delete next[key];
                changed = true;
              }
              continue;
            }
            if (next[key]) continue;
            if (participant.status !== 'racing' && !participant.racingStartedAt) continue;
            next[key] = applySharedPauseToRun(
              createJudgeStationWatchRun(participant, new Date(clockIso).getTime()),
              liveClock,
            );
            changed = true;
          }
          if (!changed) return prev;
          const visibleKeys =
            judgeStationOrder == null
              ? Object.keys(next)
              : Object.keys(next).filter((key) =>
                  isParticipantVisibleToJudge(next[key], segments, judgeStationOrder),
                );
          setActiveKey((current) =>
            current && visibleKeys.includes(current) ? current : visibleKeys[0] ?? null,
          );
          return next;
        });
        return;
      }

      const snapshots = await fetchLiveTimingSnapshots(eventId);
      const stationProgress = selectedEvent.supabaseId
        ? await fetchLiveStationProgress(selectedEvent.supabaseId)
        : (selectedEvent.liveStationProgress ?? {});
      if (selectedEvent.supabaseId && Object.keys(stationProgress).length > 0) {
        useEventsStore.setState((state) => ({
          events: state.events.map((event) =>
            event.id === selectedEvent.id
              ? {
                  ...event,
                  liveStationProgress: {
                    ...(event.liveStationProgress ?? {}),
                    ...stationProgress,
                  },
                }
              : event,
          ),
        }));
      }
      const cloudRuns = snapshots.length
        ? buildRunsFromSnapshots(snapshots, eventId, participants, segments)
        : new Map();

      setRuns((prev) => {
        let next = { ...prev };
        let changed = false;
        for (const [key, { run: cloudRun, updatedAt }] of cloudRuns) {
          if (cloudRun.participant.status === 'finished') continue;
          const local = prev[key];
          const cloudUpdatedAt = new Date(updatedAt).getTime();
          if (
            !isCloudTimingAhead(local, cloudRun, cloudUpdatedAt, localTouchedAtRef.current[key])
          ) {
            continue;
          }
          next[key] = applySharedPauseToRun(
            local ? mergeCloudProgress(local, cloudRun) : cloudRun,
            raceClock,
          );
          changed = true;
        }
        for (const snapshot of snapshots) {
          if (snapshot.bib == null) continue;
          const applied = applyStationProgressByBib(
            next,
            snapshot.bib,
            {
              completedOrders: snapshot.completedSegments.map((s) => s.segmentOrder),
              currentOrder: snapshot.currentSegmentOrder,
            },
            segments,
          );
          if (applied.changed) {
            next = applied.next;
            changed = true;
          }
        }
        const withProgress = applyAllStationProgress(
          next,
          { ...selectedEvent.liveStationProgress, ...stationProgress },
          segments,
        );
        if (withProgress.changed) {
          next = withProgress.next;
          changed = true;
        }
        return changed ? next : prev;
      });
    };

    void syncLive();
    const id = setInterval(() => void syncLive(), isJudgeView ? 750 : 1000);
    return () => clearInterval(id);
  }, [
    eventId,
    selectedEvent,
    selectedEvent?.raceStartedAt,
    selectedEvent?.racePausedAt,
    selectedEvent?.racePauseAccumMs,
    participants,
    segments,
    isJudgeView,
    judgeStationOrder,
    pickedEventId,
    isJudgeMode,
    stationMarked,
    liveTick,
  ]);

  useEffect(() => {
    if (!pickedEventId || !selectedEvent?.supabaseId || !isSupabaseConfigured()) return;
    try {
      return subscribeEventLiveClock(
        selectedEvent.supabaseId,
        () => {
          setLiveTick((tick) => tick + 1);
        },
        (bib, mark) => {
          setRuns((prev) => {
            const applied = applyStationProgressByBib(prev, bib, mark, segmentsRef.current);
            return applied.changed ? applied.next : prev;
          });
          useEventsStore.setState((state) => ({
            events: state.events.map((event) =>
              event.id === selectedEvent.id
                ? {
                    ...event,
                    liveStationProgress: {
                      ...(event.liveStationProgress ?? {}),
                      [String(bib)]: mark,
                    },
                  }
                : event,
            ),
          }));
        },
        (layoutSegments, heats) => {
          useEventsStore.setState((state) => ({
            events: state.events.map((event) => {
              if (event.id !== selectedEvent.id && event.supabaseId !== selectedEvent.supabaseId) {
                return event;
              }
              const nextSegments = layoutSegments.map((s, idx) => ({
                id: `${event.id}-seg-${String(s.order ?? idx + 1).padStart(2, '0')}`,
                order: s.order,
                type: s.type,
                name: s.name,
                target: s.target,
              }));
              const athleteState = useAthletesStore.getState();
              const localParticipants = buildTimingParticipants(
                athleteState.athletes.filter((a) => a.eventId === event.id),
                athleteState.pairs.filter((p) => p.eventId === event.id),
                event.categories,
              );
              return {
                ...event,
                segments: nextSegments,
                heats: remapHeatRostersToLocalParticipants(heats, localParticipants),
                courseLayoutSynced: true,
              };
            }),
          }));
        },
      );
    } catch {
      return undefined;
    }
  }, [pickedEventId, selectedEvent?.supabaseId]);

  useEffect(() => {
    if (!eventId || !eventFinished || !raceClock.startedAt) return;
    const frozen = raceClock.pausedAt ? raceClock : pauseRaceClock(raceClock);
    if (!raceClock.pausedAt) {
      setRaceClock(eventId, frozen);
    }
    applyClockToAllRuns(frozen);
  }, [eventId, eventFinished, raceClock.startedAt, raceClock.pausedAt]);

  useEffect(() => {
    if (!eventId || !raceClock.startedAt) return;
    const previous = lastRaceStartByEventRef.current[eventId];
    if (previous && previous !== raceClock.startedAt) {
      clearEventStationMarks(eventId);
    }
    lastRaceStartByEventRef.current[eventId] = raceClock.startedAt;
  }, [eventId, raceClock.startedAt, clearEventStationMarks]);

  useEffect(() => {
    if (!raceClock.startedAt) return;
    const startedMs = new Date(raceClock.startedAt).getTime();
    if (!Number.isFinite(startedMs)) return;
    setRuns((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const key of Object.keys(next)) {
        const aligned = applySharedPauseToRun(next[key], raceClock);
        if (aligned !== next[key]) {
          next[key] = aligned;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [raceClock.startedAt, raceClock.pausedAt, raceClock.pauseAccumMs, isJudgeView]);

  function handleEventChange(id: string) {
    setPickedEventId(id);
    setSearch('');
    setRuns({});
    setActiveKey(null);
    localTouchedAtRef.current = {};
    savedRankingKeysRef.current = new Set();
    router.setParams({ eventId: id });
  }

  function handleBackToEventList() {
    setPickedEventId(null);
    setSearch('');
    setRuns({});
    setActiveKey(null);
    localTouchedAtRef.current = {};
    savedRankingKeysRef.current = new Set();
    router.replace('/(tabs)/timing');
  }

  function touchRun(key: string) {
    localTouchedAtRef.current[key] = Date.now();
  }

  function updateRun(key: string, updater: (run: TimingRunState) => TimingRunState) {
    setRuns((prev) => {
      const run = prev[key];
      if (!run) return prev;
      touchRun(key);
      return { ...prev, [key]: updater(run) };
    });
  }

  async function syncRunToCloud(run: TimingRunState) {
    if (!selectedEvent || (!isOrganizer && !isJudgeView)) return;
    try {
      await pushEventToSupabase(selectedEvent.id);
      const event = useEventsStore.getState().events.find((e) => e.id === selectedEvent.id) ?? selectedEvent;
      await startLiveRunInCloud(event, run.participant, new Date(run.raceStartedAt).toISOString());
      await pushTimingRunState(event, run, segments, Date.now());
    } catch {
      // mantém cronômetro local
    }
  }

  async function startParticipant(participant: TimingParticipant, raceStartedAt?: number) {
    if (!eventId || !isOrganizer) return;
    const key = participantKey(participant);
    if (runs[key]) {
      setActiveKey(key);
      return;
    }
    const startedAt = raceStartedAt ?? Date.now();
    const startedAtIso = new Date(startedAt).toISOString();
    const newRun = createHeatTimingRun(participant, startedAt, segments);
    touchRun(key);
    setRuns((prev) => ({ ...prev, [key]: newRun }));
    setActiveKey(key);
    const result = setParticipantStatus(eventId, participant.id, participant.type, 'racing');
    if (!result.ok) {
      Alert.alert('Cronômetro', result.reason);
      return;
    }
    if (selectedEvent) {
      try {
        if (!selectedEvent.raceStartedAt) {
          const clock = startRaceClock(startedAt);
          setRaceClock(eventId, clock);
          await persistEventRaceClock(selectedEvent, clock);
        }
        await pushEventToSupabase(eventId);
        const freshEvent = useEventsStore.getState().events.find((e) => e.id === eventId);
        await startLiveRunInCloud(freshEvent ?? selectedEvent, participant, startedAtIso);
      } catch {
        // mantém cronômetro local mesmo se a nuvem falhar
      }
    }
  }

  async function persistRaceClock(clock: ReturnType<typeof startRaceClock>) {
    if (!eventId || !selectedEvent) return;
    setRaceClock(eventId, clock);
    const event = useEventsStore.getState().events.find((e) => e.id === eventId) ?? selectedEvent;
    const result = await persistEventRaceClock(event, clock);
    if (!result.ok) {
      Alert.alert(
        'Nuvem',
        'O cronômetro local atualizou, mas os juízes só sincronizam depois de criar as colunas race_paused_at e race_pause_accum_ms no Supabase (migration 016).',
      );
    }
  }

  function applyClockToAllRuns(clock: ReturnType<typeof startRaceClock>) {
    setRuns((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const key of Object.keys(next)) {
        const aligned = applySharedPauseToRun(next[key], clock);
        if (aligned !== next[key]) {
          next[key] = aligned;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }

  async function startHeat(heatId: string) {
    if (!eventId || !selectedEvent || !isOrganizer) return;
    if (selectedEvent.status !== 'live') {
      const statusResult = updateEventStatus(eventId, 'live');
      if (!statusResult.ok) {
        Alert.alert('Evento', statusResult.reason);
        return;
      }
    }
    const freshEvent =
      useEventsStore.getState().events.find((e) => e.id === eventId) ?? selectedEvent;
    const heat = (freshEvent.heats ?? []).find((h) => h.id === heatId);
    if (!heat) return;
    const mark = markHeatStarted(eventId, heatId);
    if (!mark.ok) {
      Alert.alert('Bateria', mark.reason);
      return;
    }
    const startedAt = Date.now();
    const startedAtIso = new Date(startedAt).toISOString();
    const batch = assignedParticipantsForHeat(participants, heat).filter(
      (p) => p.status !== 'dnf' && p.status !== 'dns',
    );
    if (batch.length === 0) {
      Alert.alert(
        'Bateria',
        'Nenhum atleta vinculado a esta bateria. Vincule os atletas em Baterias e tente de novo.',
      );
      return;
    }

    const batchKeys = new Set(batch.map((p) => participantKey(p)));
    const otherActive = Object.values(runs).some(
      (run) => !run.raceComplete && !batchKeys.has(participantKey(run.participant)),
    );
    const isRestart = !!heat.startedAt;
    if (!selectedEvent.raceStartedAt || !otherActive) {
      await persistRaceClock(startRaceClock(startedAt));
    } else if (isRestart && isSharedRacePaused(raceClock)) {
      await persistRaceClock(resumeRaceClock(raceClock, startedAt));
    }
    clearParticipantStationMarks(eventId, [...batchKeys]);
    for (const key of batchKeys) {
      savedRankingKeysRef.current.delete(key);
    }

    setRuns((prev) => {
      const next = { ...prev };
      for (const p of batch) {
        const key = participantKey(p);
        next[key] = createHeatTimingRun(p, startedAt, segments);
        touchRun(key);
      }
      return next;
    });
    setActiveKey(participantKey(batch[0]));

    for (const p of batch) {
      const result = setParticipantStatus(eventId, p.id, p.type, 'racing');
      if (!result.ok) {
        Alert.alert('Cronômetro', result.reason);
        continue;
      }
      try {
        await pushEventToSupabase(eventId);
        const event = useEventsStore.getState().events.find((e) => e.id === eventId) ?? selectedEvent;
        await startLiveRunInCloud(event, p, startedAtIso);
      } catch {
        // mantém cronômetro local
      }
    }
  }

  function scrollToTimerPanel() {
    if (Platform.OS !== 'web' || !timerPanelRef.current) return;
    const node = timerPanelRef.current as unknown as HTMLElement;
    node.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }

  function ensureJudgeRun(participant: TimingParticipant): string {
    const key = participantKey(participant);
    const heats = selectedEvent?.heats ?? [];
    if (!isParticipantRaceStarted(participant, participants, heats, raceClock.startedAt)) {
      Alert.alert(
        'Bateria não iniciada',
        'Aguarde o organizador iniciar a bateria (ou o atleta) antes de apontar a estação.',
      );
      setActiveKey(key);
      return key;
    }
    const startedAtMs =
      runs[key]?.raceStartedAt ??
      (participant.racingStartedAt ? new Date(participant.racingStartedAt).getTime() : null);
    if (
      judgeStationOrder != null &&
      (isStationMarkedAfter(eventId, judgeStationOrder, key, startedAtMs) ||
        (runs[key] && hasCompletedJudgeStation(runs[key], segments, judgeStationOrder)))
    ) {
      setActiveKey(key);
      return key;
    }
    if (!runs[key]) {
      const clockIso = participant.racingStartedAt ?? raceClock.startedAt;
      if (!clockIso) {
        setActiveKey(key);
        return key;
      }
      const newRun = applySharedPauseToRun(
        createJudgeStationWatchRun(participant, new Date(clockIso).getTime()),
        raceClock,
      );
      setRuns((prev) => ({ ...prev, [key]: newRun }));
    }
    setActiveKey(key);
    return key;
  }

  function selectActive(key: string) {
    setActiveKey(key);
    const picked = runs[key] ?? runList.find((r) => participantKey(r.participant) === key);
    if (picked && !runs[key]) {
      setRuns((prev) => ({ ...prev, [key]: picked }));
    }
    if (!wide) {
      requestAnimationFrame(() => scrollToTimerPanel());
    }
  }

  function openParticipantTimer(participant: TimingParticipant) {
    const key = participantKey(participant);
    if (isJudgeView) {
      ensureJudgeRun(participant);
      if (!wide) requestAnimationFrame(() => scrollToTimerPanel());
      return;
    }
    if (runs[key]) {
      selectActive(key);
      return;
    }
    if (participant.status === 'finished') {
      const athleteOrPair =
        participant.type === 'pair'
          ? pairs.find((p) => p.id === participant.id)
          : athletes.find((a) => a.id === participant.id);
      const totalMs = athleteOrPair?.totalMs ?? 0;
      const segmentTimes = athleteOrPair?.segmentTimes ?? [];
      const startedIso = participant.racingStartedAt ?? raceClock.startedAt;
      const finished = createFinishedTimingRun(
        participant,
        totalMs,
        segmentTimes,
        startedIso ? new Date(startedIso).getTime() : undefined,
      );
      setRuns((prev) => ({ ...prev, [key]: finished }));
      setActiveKey(key);
      if (!wide) requestAnimationFrame(() => scrollToTimerPanel());
      return;
    }
    const startedIso = participant.racingStartedAt ?? raceClock.startedAt;
    if (!startedIso) {
      Alert.alert(
        'Cronômetro',
        'Inicie a bateria deste atleta para abrir o cronômetro dele.',
      );
      setActiveKey(key);
      return;
    }
    const newRun = applySharedPauseToRun(
      createHeatTimingRun(participant, new Date(startedIso).getTime(), segments),
      raceClock,
    );
    touchRun(key);
    setRuns((prev) => ({ ...prev, [key]: newRun }));
    setActiveKey(key);
    if (!wide) requestAnimationFrame(() => scrollToTimerPanel());
  }

  useEffect(() => {
    if (!pickedEventId || segments.length === 0) return;
    setRuns((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [key, run] of Object.entries(prev)) {
        if (run.raceComplete) continue;
        const finalized = finalizeRunIfCourseComplete(run, segments, Date.now());
        if (finalized.raceComplete && !run.raceComplete) {
          next[key] = finalized;
          changed = true;
          void syncRunToCloud(finalized);
        }
      }
      return changed ? next : prev;
    });
  }, [pickedEventId, segments, liveTick]);

  useEffect(() => {
    if (!isOrganizer || eventFinished || !eventId) return;
    if (!raceClock.startedAt || raceClock.pausedAt) return;
    const active = Object.values(runs).filter(
      (run) => !run.raceComplete && run.participant.status !== 'finished',
    );
    if (Object.keys(runs).length === 0 || active.length > 0) return;
    const paused = pauseRaceClock(raceClock, Date.now());
    setRaceClock(eventId, paused);
    void persistRaceClock(paused);
  }, [runs, isOrganizer, eventFinished, eventId, raceClock.startedAt, raceClock.pausedAt]);

  useEffect(() => {
    if (!paramParticipantKey || !pickedEventId) return;
    setActiveKey(paramParticipantKey);
    const participant = participants.find((p) => participantKey(p) === paramParticipantKey);
    if (!participant) return;
    if (runs[paramParticipantKey]) return;
    openParticipantTimer(participant);
  }, [paramParticipantKey, pickedEventId, participants]);

  function stopTracking(key: string) {
    setRuns((prev) => {
      const next = { ...prev };
      delete next[key];
      setActiveKey((current) => {
        if (current !== key) return current;
        const remaining = Object.keys(next);
        return remaining[0] ?? null;
      });
      return next;
    });
  }

  const judgeActions = useMemo(
    () =>
      isJudgeView && activeRun
        ? getJudgeStationActions(activeRun, segments, judgeStationOrder)
        : null,
    [isJudgeView, activeRun, segments, judgeStationOrder],
  );

  function applyRunUpdate(key: string, nextRun: TimingRunState) {
    let finalized = finalizeRunIfCourseComplete(nextRun, segments, now);
    if (finalized.raceComplete) {
      finalized = ensureFinishSegmentTimes(finalized, segments, now);
    }
    touchRun(key);
    setRuns((prev) => {
      const next = { ...prev, [key]: finalized };
      if (
        isJudgeView &&
        judgeStationOrder != null &&
        !isParticipantVisibleToJudge(finalized, segments, judgeStationOrder)
      ) {
        markStationDone(eventId, judgeStationOrder, key);
        delete next[key];
        const remaining = Object.keys(next);
        setActiveKey(remaining[0] ?? null);
      }
      return next;
    });
    void syncRunToCloud(finalized);
    if (finalized.raceComplete && isOrganizer && !eventFinished) {
      const othersActive = Object.entries(runs).some(
        ([k, run]) => k !== key && !run.raceComplete && run.participant.status !== 'finished',
      );
      if (!othersActive && raceClock.startedAt && !raceClock.pausedAt) {
        const paused = pauseRaceClock(raceClock, now);
        setRaceClock(eventId, paused);
        void persistRaceClock(paused);
      }
    }
  }

  function assertJudgeCanMark(): boolean {
    if (!activeRun) return false;
    const heats = selectedEvent?.heats ?? [];
    if (
      !isParticipantRaceStarted(
        activeRun.participant,
        participants,
        heats,
        raceClock.startedAt,
      )
    ) {
      Alert.alert(
        'Bateria não iniciada',
        'Aguarde o organizador iniciar a bateria (ou o atleta) antes de apontar a estação.',
      );
      return false;
    }
    if (racePaused) {
      Alert.alert(
        'Prova pausada',
        'O organizador pausou o tempo total. Aguarde a retomada para apontar a estação.',
      );
      return false;
    }
    return true;
  }

  function handleReceiveAtStation() {
    if (!activeKey || !activeRun || !isJudgeView || judgeStationOrder == null) return;
    if (!assertJudgeCanMark()) return;
    const nextRun = receiveAthleteAtStation(activeRun, segments, judgeStationOrder, now);
    if (!nextRun) return;
    applyRunUpdate(activeKey, nextRun);
  }

  function handleReleaseFromStation() {
    if (!activeKey || !activeRun || !isJudgeView || judgeStationOrder == null) return;
    if (!assertJudgeCanMark()) return;
    const segment = segments[activeRun.segmentIndex];
    if (!segment || segment.type !== 'station') return;
    const segMs = getSegmentMs(activeRun, now);
    if (segMs === 0 && !isSegmentRunning(activeRun)) return;
    const nextRun = releaseAthleteFromStation(activeRun, segment.id, segments, now);
    markStationDone(eventId, judgeStationOrder, activeKey);
    applyRunUpdate(activeKey, nextRun);
  }

  function handleNextSegment() {
    if (!isOrganizer || !activeKey || !activeRun) return;
    const segment = segments[activeRun.segmentIndex];
    if (!segment) return;
    const nextRun = advanceSegment(activeRun, segment.id, now, segments);
    applyRunUpdate(activeKey, nextRun);
  }

  function handleTogglePause() {
    if (!activeKey || !activeRun || activeRun.raceComplete) return;
    if (!isOrganizer && !isJudgeView) return;
    const nextRun = toggleSegmentRun(activeRun, now);
    applyRunUpdate(activeKey, nextRun);
  }

  function handleToggleTotalPause() {
    if (!isOrganizer || eventFinished || !raceClock.startedAt) return;
    const nextClock = racePaused ? resumeRaceClock(raceClock, now) : pauseRaceClock(raceClock, now);
    setRaceClock(eventId, nextClock);
    applyClockToAllRuns(nextClock);
    void persistRaceClock(nextClock);
  }

  function goToRanking(savedEventId: string, savedCategoryId: string) {
    router.push(
      `/(tabs)/leaderboard?eventId=${encodeURIComponent(savedEventId)}&categoryId=${encodeURIComponent(savedCategoryId)}`,
    );
  }

  function saveRunToRanking(run: TimingRunState, goToBoard: boolean) {
    if (!isOrganizer || !eventId) return false;
    const { participant } = run;
    const withSplits = ensureFinishSegmentTimes(run, segments, now);
    const frozen = withSplits.frozenTotalMs || getTotalMs(withSplits, now);
    const result = recordParticipantFinish(
      eventId,
      participant.id,
      participant.type,
      frozen,
      withSplits.segmentTimes,
    );
    if (!result.ok) {
      Alert.alert('Não foi possível salvar', result.reason);
      return false;
    }
    const key = participantKey(participant);
    setRuns((prev) => ({
      ...prev,
      [key]: {
        ...run,
        raceComplete: true,
        frozenTotalMs: frozen,
        segmentStartedAt: null,
        totalPausedAt: run.totalPausedAt ?? now,
        participant: { ...participant, status: 'finished' },
      },
    }));
    if (goToBoard) {
      goToRanking(eventId, participant.categoryId);
    }
    return true;
  }

  function handleSaveFinish() {
    if (!isOrganizer || !activeRun) return;
    saveRunToRanking(activeRun, true);
  }

  useEffect(() => {
    if (!isOrganizer || !eventId) return;
    for (const run of Object.values(runs)) {
      if (!run.raceComplete) continue;
      const key = participantKey(run.participant);
      if (savedRankingKeysRef.current.has(key)) continue;
      if (run.participant.status === 'finished') {
        savedRankingKeysRef.current.add(key);
        continue;
      }
      savedRankingKeysRef.current.add(key);
      if (!saveRunToRanking(run, false)) {
        savedRankingKeysRef.current.delete(key);
      }
    }
  }, [runs, isOrganizer, eventId]);

  function runDisplayMs(run: TimingRunState): number {
    const finalized = finalizeRunIfCourseComplete(run, segments, now);
    if (finalized.raceComplete || finalized.participant.status === 'finished') {
      return finalized.frozenTotalMs || getTotalMs({ ...finalized, raceComplete: false }, now);
    }
    if (eventFinished) {
      const frozenNow = displayClock.pausedAt
        ? new Date(displayClock.pausedAt).getTime()
        : now;
      return getTotalMs(finalized, Number.isFinite(frozenNow) ? frozenNow : now);
    }
    if (isJudgeView) {
      return getSharedRaceMs(displayClock, now) ?? getTotalMs(finalized, now);
    }
    return getTotalMs(finalized, now);
  }

  function renderJudgeWaitingTimer() {
    const station = judgeStationOrder != null
      ? segments.find((s) => s.order === judgeStationOrder && s.type === 'station')
      : undefined;
    const clockRun = runList[0];
    const sharedMs = getSharedRaceMs(displayClock, now);
    const heatStarted = sharedMs != null || !!clockRun;
    const totalMs = sharedMs ?? (clockRun ? getTotalMs(clockRun, now) : 0);
    return (
      <View style={styles.timerSection}>
        <View style={styles.timerCard}>
          <TimerDisplay
            elapsedMs={0}
            segmentName={station?.name ?? 'Sua estação'}
            segmentTarget={station?.target ?? 'Aguardando atleta'}
            segmentType="station"
            segmentIndex={station?.order ?? 0}
            totalSegments={segments.length || 1}
          />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Tempo total da prova</Text>
            <Text
              style={[
                styles.totalValue,
                heatStarted && !racePaused && !eventFinished && styles.totalValueLive,
              ]}>
              {heatStarted ? formatMs(totalMs) : '—'}
            </Text>
          </View>
          <Text style={eventFinished || racePaused ? styles.pausedHint : heatStarted ? styles.liveHint : styles.pausedHint}>
            {eventFinished
              ? 'Evento encerrado. O tempo total foi congelado.'
              : racePaused
                ? 'Tempo total pausado pelo organizador. Apontamento bloqueado até retomar.'
                : heatStarted
                  ? 'Bateria em andamento. Toque no atleta ao chegar na estação.'
                  : 'Aguardando o organizador iniciar a bateria.'}
          </Text>
        </View>
      </View>
    );
  }

  function renderActiveTimer() {
    if (!activeRun || !activeParticipant) return null;
    const displayRun = finalizeRunIfCourseComplete(activeRun, segments, now);

    const stationSegment =
      isJudgeView && judgeStationOrder != null
        ? segments.find((s) => s.order === judgeStationOrder && s.type === 'station')
        : undefined;
    const atJudgeStation =
      isJudgeView &&
      judgeStationOrder != null &&
      isParticipantAtStation(displayRun, segments, judgeStationOrder);
    const segment = atJudgeStation
      ? segments[displayRun.segmentIndex]
      : stationSegment ?? segments[displayRun.segmentIndex];
    const segmentMs =
      displayRun.raceComplete
        ? 0
        : atJudgeStation || !isJudgeView
          ? getSegmentMs(displayRun, now)
          : 0;
    const totalMs = runDisplayMs(displayRun);
    const segmentRunning = isSegmentRunning(displayRun);
    const totalPaused = racePaused || isTotalTimePaused(displayRun) || displayRun.raceComplete;

    return (
      <View ref={timerPanelRef} style={styles.timerSection} collapsable={false}>
        {displayRun.raceComplete ? (
          <View style={styles.finishedCard}>
            <Text style={[styles.finishedTitle, narrow && styles.finishedTitleCompact]}>
              Prova finalizada
            </Text>
            <Text style={[styles.finishedTime, narrow && styles.finishedTimeCompact]}>
              {formatMs(totalMs)}
            </Text>
            <Text style={styles.finishedSub}>
              #{activeParticipant.bib} {activeParticipant.label}
            </Text>
            {isOrganizer && (
              <Button
                label="Salvar tempo no ranking"
                onPress={handleSaveFinish}
                large
                style={{ marginTop: 16, width: '100%' }}
              />
            )}
          </View>
        ) : (
          <>
            <View style={styles.participantBanner}>
              <Text style={styles.athlete} numberOfLines={2}>
                #{activeParticipant.bib} {activeParticipant.label}
              </Text>
              <Text style={styles.athleteMeta} numberOfLines={1}>
                {selectedEvent?.name} · {activeParticipant.categoryName}
              </Text>
            </View>

            {segments.length > 0 && segment ? (
              <>
                {!isJudgeView && (
                  <View style={styles.segmentProgressWrap}>
                    <SegmentProgress
                      segments={segments}
                      currentIndex={displayRun.segmentIndex}
                      completedIndices={displayRun.completed}
                    />
                  </View>
                )}

                <View style={styles.timerCard}>
                  {isJudgeView && !atJudgeStation && (
                    <Text style={styles.runIntervalHint}>
                      Tempo da estação (parte do cronômetro total). Registre chegada e saída.
                    </Text>
                  )}
                  {isJudgeView && atJudgeStation && (
                    <Text style={styles.runIntervalHint}>
                      Estação em andamento — este tempo entra no cronômetro total da prova.
                    </Text>
                  )}
                  <TimerDisplay
                    elapsedMs={segmentMs}
                    segmentName={
                      isJudgeView ? (stationSegment?.name ?? segment.name) : segment.name
                    }
                    segmentTarget={
                      isJudgeView ? (stationSegment?.target ?? segment.target) : segment.target
                    }
                    segmentType={isJudgeView ? 'station' : segment.type}
                    segmentIndex={isJudgeView ? (stationSegment?.order ?? segment.order) : segment.order}
                    totalSegments={segments.length}
                  />
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>
                      {isJudgeView ? 'Tempo total da prova' : 'Tempo total'}
                    </Text>
                    <Text style={styles.totalValue}>{formatMs(totalMs)}</Text>
                  </View>
                  {(eventFinished || totalPaused) && (
                    <Text style={styles.pausedHint}>
                      {eventFinished
                        ? 'Evento encerrado. O tempo total foi congelado.'
                        : displayRun.raceComplete
                          ? 'Prova finalizada. Tempo congelado.'
                        : isJudgeView
                          ? 'Tempo total pausado pelo organizador. Apontamento bloqueado até retomar.'
                          : 'Tempo total pausado'}
                    </Text>
                  )}
                  {!isJudgeView &&
                    !totalPaused &&
                    !segmentRunning &&
                    segmentMs > 0 &&
                    !displayRun.raceComplete && (
                    <Text style={styles.pausedHint}>Segmento pausado</Text>
                  )}
                </View>

                {isOrganizer &&
                  !displayRun.raceComplete &&
                  !totalPaused &&
                  (segmentRunning || segmentMs > 0) && (
                    <Button
                      label={segmentRunning ? 'Pausar' : 'Retomar'}
                      variant="secondary"
                      onPress={handleTogglePause}
                      large
                      style={{ marginBottom: 8 }}
                    />
                  )}

                {isJudgeView && !eventFinished && judgeActions?.canReceive && !racePaused && (
                  <Button
                    label="Atleta chegou — iniciar cronômetro"
                    onPress={handleReceiveAtStation}
                    large
                    style={{ marginBottom: 8 }}
                  />
                )}
                {isJudgeView && !eventFinished && judgeActions?.canRelease && !racePaused && (
                  <Button
                    label="Encerrar estação e registrar tempo"
                    onPress={handleReleaseFromStation}
                    disabled={segmentMs === 0 && !segmentRunning}
                    large
                    style={{ marginBottom: 8 }}
                  />
                )}
                {isOrganizer && !displayRun.raceComplete && (
                  <Button
                    label={totalPaused ? 'Retomar tempo total' : 'Pausar tempo total'}
                    variant={totalPaused ? 'primary' : 'secondary'}
                    onPress={handleToggleTotalPause}
                    large
                    style={{ marginBottom: 8 }}
                  />
                )}
                {isOrganizer && !displayRun.raceComplete && !totalPaused && (
                  <Button
                    label="Próximo segmento →"
                    onPress={handleNextSegment}
                    large
                    style={{ marginBottom: 8 }}
                  />
                )}
                {isOrganizer && !displayRun.raceComplete && (
                  <Button
                    label="Finalizar prova deste atleta"
                    variant="secondary"
                    onPress={() => {
                      if (!activeKey || !activeRun) return;
                      const done = ensureFinishSegmentTimes(
                        finalizeRunIfCourseComplete(
                          {
                            ...activeRun,
                            completed: segments.map((_, idx) => idx),
                            segmentIndex: segments.length,
                          },
                          segments,
                          now,
                        ),
                        segments,
                        now,
                      );
                      applyRunUpdate(activeKey, done);
                    }}
                    large
                    style={{ marginBottom: 8 }}
                  />
                )}
              </>
            ) : (
              <Text style={styles.empty}>Este evento não tem segmentos configurados.</Text>
            )}
          </>
        )}
      </View>
    );
  }

  if (!selectedEvent && (events.length === 0 || timingEvents.length === 0)) {
    return (
      <Screen>
        <Text style={styles.heading}>Cronômetro</Text>
        <Text style={styles.empty}>
          {isJudgeMode
            ? 'Nenhum evento designado ainda. Peça ao organizador para te adicionar em Juízes e puxe para atualizar na aba Eventos.'
            : events.length === 0
              ? 'Crie um evento para usar o cronômetro.'
              : 'Nenhum evento com inscrições abertas ou ao vivo. Coloque o evento em "Ao vivo" ou "Inscrições" para cronometrar.'}
        </Text>
      </Screen>
    );
  }

  if (!pickedEventId || !selectedEvent) {
    return (
      <Screen scroll>
        <Text style={[styles.heading, narrow && styles.headingCompact]}>Cronômetro</Text>
        <Text style={styles.subheading}>
          Selecione um evento para carregar só os atletas e o cronômetro dessa prova.
        </Text>
        <Text style={styles.sectionTitle}>Eventos</Text>
        {timingEvents.map((event) => (
          <Card
            key={event.id}
            title={event.name}
            subtitle={`${event.location} · ${new Date(event.date).toLocaleDateString('pt-BR')}`}
            badge={formatStatusLabel(event.status)}
            badgeColor={
              event.status === 'live'
                ? HyroxTheme.success + '33'
                : event.status === 'finished'
                  ? HyroxTheme.textMuted + '33'
                  : HyroxTheme.warning + '33'
            }
            onPress={() => handleEventChange(event.id)}>
            <Text style={styles.eventCardMeta}>
              {event.status === 'finished'
                ? 'Encerrado — o tempo total fica congelado'
                : event.status === 'live'
                  ? 'Ao vivo — toque para cronometrar'
                  : 'Toque para abrir o cronômetro'}
            </Text>
          </Card>
        ))}
      </Screen>
    );
  }

  const sidebar = (
    <>
      {runList.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Em prova ({runList.length})</Text>
          <Text style={styles.hint}>
            Toque no atleta para ver o cronômetro
            {isJudgeView ? ' total e apontar a estação.' : ' e os botões de controle logo abaixo.'}
          </Text>
          {runList.map((run) => {
            const key = participantKey(run.participant);
            const isActive = key === activeKey;
            const liveTotal = runDisplayMs(run);
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                style={({ pressed }) => [
                  styles.runRow,
                  compact && styles.runRowCompact,
                  isActive && styles.runRowActive,
                  pressed && styles.runRowPressed,
                ]}
                onPress={() => selectActive(key)}>
                <Text style={[styles.participantBib, compact && styles.participantBibCompact]}>
                  #{run.participant.bib}
                </Text>
                <View style={styles.participantInfo}>
                  <Text style={styles.participantName} numberOfLines={1}>
                    {run.participant.label}
                  </Text>
                  <Text style={styles.participantMeta} numberOfLines={compact ? 2 : 1}>
                    {run.participant.type === 'pair' ? 'Dupla' : 'Individual'} ·{' '}
                    {run.participant.categoryName}
                    {!isJudgeView && segments[run.segmentIndex]
                      ? ` · ${segments[run.segmentIndex].name}`
                      : ''}
                    {isJudgeView && judgeStationOrder != null && isParticipantApproachingStation(run, segments, judgeStationOrder)
                      ? ' · A caminho'
                      : ''}
                    {isJudgeView && judgeStationOrder != null && isParticipantAtStation(run, segments, judgeStationOrder)
                      ? isSegmentRunning(run)
                        ? ' · No WOD'
                        : getSegmentMs(run, now) > 0
                          ? ' · Pausado'
                          : ' · Aguardando início'
                      : ''}
                    {run.raceComplete ? ' · Aguardando salvar' : ''}
                  </Text>
                </View>
                <Text style={[styles.liveTime, compact && styles.liveTimeCompact]}>
                  {formatMs(liveTotal)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {!wide && (activeRun ? renderActiveTimer() : isJudgeView ? renderJudgeWaitingTimer() : null)}

      {!activeRun && runList.length > 0 && (
        <Text style={styles.hint}>Selecione um participante na lista acima.</Text>
      )}

      {(selectedEvent?.heats ?? []).length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Baterias</Text>
          {isJudgeView && (
            <Text style={styles.hint}>
              O organizador inicia a bateria. Você vê o tempo total e registra só a chegada e a
              saída da sua estação — esse tempo entra no cronômetro da prova.
            </Text>
          )}
          {(selectedEvent?.heats ?? []).map((heat) => {
            const assigned = assignedParticipantsForHeat(participants, heat);
            return (
              <View key={heat.id} style={styles.heatCard}>
                <Text style={styles.participantName}>{heat.name}</Text>
                <Text style={styles.participantMeta}>
                  {new Date(heat.scheduledStartAt).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {heat.startedAt ? ' · iniciada' : ''}
                  {' · '}
                  {assigned.length} atleta{assigned.length === 1 ? '' : 's'}
                </Text>
                {!isJudgeView && assigned.length > 0 && (
                  <View style={{ marginTop: 8, gap: 6 }}>
                    {assigned.map((p) => {
                      const key = participantKey(p);
                      const isActive = key === activeKey;
                      return (
                        <Pressable
                          key={key}
                          onPress={() => openParticipantTimer(p)}
                          style={[
                            styles.runRow,
                            compact && styles.runRowCompact,
                            isActive && styles.runRowActive,
                          ]}>
                          <Text style={[styles.participantBib, compact && styles.participantBibCompact]}>
                            #{p.bib}
                          </Text>
                          <View style={styles.participantInfo}>
                            <Text style={styles.participantName} numberOfLines={1}>
                              {p.label}
                            </Text>
                            <Text style={styles.participantMeta} numberOfLines={1}>
                              {p.status === 'racing' || runs[key]
                                ? 'Em prova — toque para ver o cronômetro'
                                : heat.startedAt
                                  ? 'Bateria iniciada — toque para abrir'
                                  : 'Aguardando início da bateria'}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
                {isOrganizer && !eventFinished && (
                  <Button
                    label={heat.startedAt ? 'Reiniciar bateria' : 'Iniciar bateria'}
                    variant="primary"
                    onPress={() => void startHeat(heat.id)}
                    style={{ marginTop: 10, width: '100%' }}
                  />
                )}
              </View>
            );
          })}
        </View>
      )}

      {isJudgeView && judgeStationOrder == null && (
        <View style={styles.section}>
          <Text style={styles.empty}>
            Você ainda não tem estação designada. Peça ao organizador para definir em Juízes do
            evento.
          </Text>
        </View>
      )}

      {isJudgeView && !eventFinished && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Atletas da estação</Text>
          <Text style={styles.hint}>
            Toque no atleta quando ele chegar. O cronômetro da estação aparece acima.
          </Text>
          {judgeRosterParticipants.length === 0 ? (
            <Text style={styles.empty}>
              {participants.length === 0
                ? 'Nenhum atleta sincronizado neste evento. Puxe para atualizar na aba Eventos ou peça ao organizador para salvar o evento na nuvem.'
                : !raceClock.startedAt &&
                    !(selectedEvent?.heats ?? []).some((h) => h.startedAt) &&
                    !participants.some((p) => p.status === 'racing' || !!p.racingStartedAt)
                  ? 'Aguarde o organizador iniciar a bateria ou o atleta.'
                  : 'Todos os atletas desta estação já foram apontados.'}
            </Text>
          ) : (
            judgeRosterParticipants.map((p) => {
                const key = participantKey(p);
                const inRun = !!runs[key];
                return (
                  <Pressable
                    key={key}
                    style={[styles.participantRow, compact && styles.participantRowCompact]}
                    onPress={() => ensureJudgeRun(p)}>
                    <View style={styles.participantRowMain}>
                      <Text style={[styles.participantBib, compact && styles.participantBibCompact]}>
                        #{p.bib}
                      </Text>
                      <View style={styles.participantInfo}>
                        <Text style={styles.participantName} numberOfLines={1}>
                          {p.label}
                        </Text>
                        <Text style={styles.participantMeta} numberOfLines={2}>
                          {p.type === 'pair' ? 'Dupla' : 'Individual'} · {p.categoryName}
                          {inRun ? ' · pronto para cronometrar' : ''}
                        </Text>
                      </View>
                    </View>
                    <View style={[styles.startBtn, compact && styles.startBtnFull]}>
                      <Text style={styles.startBtnText}>Selecionar</Text>
                    </View>
                  </Pressable>
                );
              })
          )}
        </View>
      )}

      {isOrganizer && !eventFinished && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Iniciar participante</Text>
          <TextInput
            style={styles.search}
            placeholder="Buscar por nome ou bib..."
            placeholderTextColor={HyroxTheme.textMuted}
            value={search}
            onChangeText={setSearch}
          />

          {participants.length === 0 && (
            <Text style={styles.empty}>Nenhum atleta ou dupla inscrito neste evento.</Text>
          )}

          {availableParticipants.map((p) => (
            <View
              key={participantKey(p)}
              style={[styles.participantRow, compact && styles.participantRowCompact]}>
              <View style={styles.participantRowMain}>
                <Text style={[styles.participantBib, compact && styles.participantBibCompact]}>
                  #{p.bib}
                </Text>
                <View style={styles.participantInfo}>
                  <Text style={styles.participantName} numberOfLines={1}>
                    {p.label}
                  </Text>
                  <Text style={styles.participantMeta} numberOfLines={2}>
                    {p.type === 'pair' ? `Dupla · ${p.memberNames.join(' + ')}` : 'Individual'} ·{' '}
                    {p.categoryName}
                  </Text>
                </View>
              </View>
              <Pressable
                style={[styles.startBtn, compact && styles.startBtnFull]}
                onPress={() => startParticipant(p)}>
                <Text style={styles.startBtnText}>Iniciar</Text>
              </Pressable>
            </View>
          ))}

          {availableParticipants.length === 0 && participants.length > 0 && runList.length > 0 && (
            <Text style={styles.hint}>Todos os participantes filtrados já estão em prova.</Text>
          )}
        </View>
      )}
    </>
  );

  return (
    <Screen scroll>
      <View style={[styles.page, wide && styles.pageWide]}>
        <View style={[styles.mainColumn, wide && styles.mainColumnWide]}>
          <Text style={[styles.heading, narrow && styles.headingCompact]}>Cronômetro</Text>
          <Text style={styles.subheading}>
            {isJudgeView
              ? judgeStationOrder != null
                ? `Sua estação: ${stationLabel(segments, judgeStationOrder)}. O tempo total vem do organizador; sua marcação é o split desta estação.`
                : 'Aguardando o organizador designar sua estação. Enquanto isso, você vê a prova em andamento.'
              : isOrganizer
                ? 'Visão do organizador: todos os atletas, todas as estações. Inicie baterias ou avance segmentos manualmente.'
                : 'Inicie a bateria. Todos os atletas seguem a ordem do percurso. Juízes cronometram cada estação.'}
          </Text>

          <Pressable onPress={handleBackToEventList} style={styles.backToList}>
            <Text style={styles.backToListText}>← Eventos</Text>
          </Pressable>
          <Text style={styles.selectedEventName} numberOfLines={2}>
            {selectedEvent.name}
          </Text>
          <Text style={styles.selectedEventMeta}>
            {formatStatusLabel(selectedEvent.status)}
            {selectedEvent.location ? ` · ${selectedEvent.location}` : ''}
          </Text>

          {wide && (activeRun ? renderActiveTimer() : isJudgeView ? renderJudgeWaitingTimer() : null)}
        </View>

        <View style={[styles.sideColumn, wide && styles.sideColumnWide]}>{sidebar}</View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: '100%', alignSelf: 'stretch' },
  pageWide: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: 20,
  },
  mainColumn: { width: '100%', flex: 1, minWidth: 0, maxWidth: '100%' },
  mainColumnWide: { flex: 1.1, minWidth: 280, maxWidth: '100%' },
  sideColumn: { width: '100%', flex: 1, minWidth: 0, maxWidth: '100%' },
  sideColumnWide: { flex: 1, minWidth: 280, maxWidth: '100%' },
  heading: { color: HyroxTheme.text, fontSize: 28, fontWeight: '800' },
  headingCompact: { fontSize: 24 },
  subheading: { color: HyroxTheme.textMuted, fontSize: 14, marginTop: 4, marginBottom: 16, lineHeight: 20 },
  label: { color: HyroxTheme.text, fontSize: 14, fontWeight: '600', marginBottom: 8 },
  backToList: { alignSelf: 'flex-start', marginBottom: 8, paddingVertical: 4 },
  backToListText: { color: HyroxTheme.accent, fontSize: 14, fontWeight: '700' },
  selectedEventName: { color: HyroxTheme.text, fontSize: 20, fontWeight: '800', marginBottom: 4 },
  selectedEventMeta: { color: HyroxTheme.textMuted, fontSize: 13, marginBottom: 16 },
  eventCardMeta: { color: HyroxTheme.textMuted, fontSize: 13, marginTop: 6 },
  section: { marginBottom: 20 },
  sectionTitle: {
    color: HyroxTheme.accent,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  timerSection: { marginBottom: 20, width: '100%', maxWidth: '100%' },
  segmentProgressWrap: { width: '100%', maxWidth: '100%', overflow: 'hidden' },
  search: {
    backgroundColor: HyroxTheme.surface,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: HyroxTheme.text,
    fontSize: 15,
    marginBottom: 12,
  },
  runRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: HyroxTheme.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
    padding: 12,
    marginBottom: 8,
    gap: 10,
    width: '100%',
    maxWidth: '100%',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  runRowPressed: {
    opacity: 0.85,
    borderColor: HyroxTheme.accent,
  },
  runRowActive: {
    borderColor: HyroxTheme.accent,
    backgroundColor: 'rgba(255, 237, 0, 0.08)',
  },
  runRowCompact: {
    flexWrap: 'wrap',
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: HyroxTheme.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
    padding: 14,
    marginBottom: 8,
    gap: 10,
    width: '100%',
    maxWidth: '100%',
  },
  participantRowCompact: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  participantRowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  participantBib: { color: HyroxTheme.accent, fontWeight: '800', fontSize: 14, minWidth: 44 },
  participantBibCompact: { minWidth: 36, fontSize: 13 },
  participantInfo: { flex: 1, minWidth: 0 },
  participantName: { color: HyroxTheme.text, fontSize: 15, fontWeight: '600' },
  participantMeta: { color: HyroxTheme.textMuted, fontSize: 12, marginTop: 2 },
  liveTime: {
    color: HyroxTheme.text,
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },
  liveTimeCompact: { fontSize: 12 },
  startBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: HyroxTheme.accent,
    alignSelf: 'flex-start',
  },
  startBtnFull: {
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  startBtnText: { color: '#000', fontSize: 12, fontWeight: '800' },
  participantBanner: {
    marginBottom: 12,
    padding: 12,
    backgroundColor: HyroxTheme.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
  },
  athlete: { color: HyroxTheme.text, fontSize: 16, fontWeight: '700' },
  athleteMeta: { color: HyroxTheme.textMuted, fontSize: 12, marginTop: 4 },
  timerCard: {
    backgroundColor: HyroxTheme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
    marginBottom: 16,
    width: '100%',
    overflow: 'hidden',
  },
  runIntervalHint: {
    color: HyroxTheme.textMuted,
    fontSize: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    fontStyle: 'italic',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: HyroxTheme.border,
    paddingTop: 16,
  },
  totalLabel: { color: HyroxTheme.textMuted, fontSize: 14 },
  totalValue: {
    color: HyroxTheme.text,
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  totalValueLive: {
    color: HyroxTheme.accent,
  },
  pausedHint: {
    color: HyroxTheme.warning,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    paddingBottom: 16,
  },
  liveHint: {
    color: HyroxTheme.success,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    paddingBottom: 16,
  },
  finishedCard: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: HyroxTheme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
  },
  finishedTitle: { color: HyroxTheme.text, fontSize: 20, fontWeight: '800' },
  finishedTitleCompact: { fontSize: 18 },
  finishedTime: {
    color: HyroxTheme.accent,
    fontSize: 40,
    fontWeight: '800',
    marginTop: 12,
    fontVariant: ['tabular-nums'],
  },
  finishedTimeCompact: { fontSize: 32 },
  finishedSub: { color: HyroxTheme.textMuted, fontSize: 14, marginTop: 8, textAlign: 'center' },
  hint: { color: HyroxTheme.textMuted, fontSize: 13, marginBottom: 12, lineHeight: 18 },
  empty: { color: HyroxTheme.textMuted, textAlign: 'center', marginTop: 12 },
  heatCard: {
    padding: 12,
    marginBottom: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
    backgroundColor: HyroxTheme.surface,
    width: '100%',
    maxWidth: '100%',
  },
  heatAthletes: { color: HyroxTheme.textMuted, fontSize: 12, marginTop: 6, lineHeight: 18 },
});
