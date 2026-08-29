import { router } from 'expo-router';
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
import { Screen } from '@/components/ui/Screen';
import { SegmentProgress } from '@/components/SegmentProgress';
import { TimerDisplay } from '@/components/TimerDisplay';
import { HyroxTheme } from '@/constants/Theme';
import type { HyroxEvent } from '@/src/domain/types';
import { useAthletesByEvent, useAthletesStore, usePairsByEvent } from '@/src/stores/athletesStore';
import { useEventStaffStore } from '@/src/stores/eventStaffStore';
import { useEvents, useEventsStore } from '@/src/stores/eventsStore';
import { useOrganizerStore } from '@/src/stores/organizerStore';
import {
  assignedParticipantsForHeat,
  buildTimingParticipants,
  participantsForHeat,
  type TimingParticipant,
} from '@/src/utils/participantHelpers';
import { formatMs } from '@/src/utils/formatTime';
import {
  buildRunsFromSnapshots,
  fetchLiveTimingSnapshots,
  pushTimingRunState,
  startLiveRunInCloud,
} from '@/src/api/liveTimingRepository';
import { pullAndMergeJudgeEvents, pushEventToSupabase, syncJudgeEventLive } from '@/src/api/syncService';
import { isSupabaseConfigured } from '@/src/lib/supabase';
import { useIsJudgeMode } from '@/src/stores/accessModeStore';
import { useAuthStore } from '@/src/stores/authStore';
import { useIsEventOwner } from '@/src/hooks/useEvent';
import {
  advanceSegment,
  createHeatTimingRun,
  getSegmentMs,
  getTotalMs,
  isCloudTimingAhead,
  isSegmentRunning,
  isTotalTimePaused,
  participantKey,
  receiveAthleteAtStation,
  releaseAthleteFromStation,
  toggleSegmentRun,
  toggleTotalTimePause,
  type TimingRunState,
} from '@/src/utils/timingRun';
import {
  getJudgeStationActions,
  isParticipantApproachingStation,
  isParticipantAtStation,
  isParticipantVisibleToJudge,
  stationLabel,
} from '@/src/utils/stationTiming';

export default function TimingScreen() {
  const { width } = useWindowDimensions();
  const isJudgeMode = useIsJudgeMode();
  const authUserId = useAuthStore((s) => s.user?.id);
  const assignedEventIds = useEventStaffStore((s) => s.assignedEventIds);
  const isEventOwner = useOrganizerStore((s) => s.isEventOwner);
  const contentWidth = Math.min(width, 720);
  const narrow = contentWidth < 380;
  const compact = contentWidth < 420;
  const wide = contentWidth >= 720;
  const events = useEvents();
  const markHeatStarted = useEventsStore((s) => s.markHeatStarted);
  const updateEventStatus = useEventsStore((s) => s.updateEventStatus);
  const timingEvents = useMemo(
    () =>
      events.filter((e) => {
        if (isJudgeMode) {
          if (!assignedEventIds.includes(e.id)) return false;
          return e.status === 'live' || e.status === 'open';
        }
        if (!isEventOwner(e.organizerId)) return false;
        return e.status === 'live' || e.status === 'open';
      }),
    [events, isJudgeMode, assignedEventIds, isEventOwner],
  );

  const [pickedEventId, setPickedEventId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [runs, setRuns] = useState<Record<string, TimingRunState>>({});
  const [now, setNow] = useState(Date.now());
  const localTouchedAtRef = useRef<Record<string, number>>({});
  const timerPanelRef = useRef<View>(null);

  const setParticipantStatus = useAthletesStore((s) => s.setParticipantStatus);
  const recordParticipantFinish = useAthletesStore((s) => s.recordParticipantFinish);

  const eventId = pickedEventId ?? timingEvents[0]?.id ?? '';
  const selectedEvent = timingEvents.find((e) => e.id === eventId);
  const isOrganizer = !isJudgeMode && useIsEventOwner(selectedEvent);
  const isAssignedJudge = useEventStaffStore((s) =>
    eventId ? s.isAssignedJudge(eventId) : false,
  );
  const isJudgeView = isJudgeMode && isAssignedJudge;
  const judgeStationOrder = useEventStaffStore((s) =>
    eventId ? s.judgeStationByEvent[eventId] : undefined,
  );
  const athletes = useAthletesByEvent(eventId || undefined);
  const pairs = usePairsByEvent(eventId || undefined);

  const participants = useMemo(() => {
    if (!selectedEvent) return [];
    return buildTimingParticipants(athletes, pairs, selectedEvent.categories);
  }, [athletes, pairs, selectedEvent]);

  const segments = selectedEvent?.segments ?? [];

  const runList = useMemo(() => {
    let list = Object.values(runs);
    if (isJudgeView && judgeStationOrder != null) {
      list = list.filter((run) =>
        isParticipantVisibleToJudge(run, segments, judgeStationOrder),
      );
    }
    return list.sort((a, b) => a.participant.bib - b.participant.bib);
  }, [runs, isJudgeView, judgeStationOrder, segments]);

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
    if (!isJudgeView || !eventId || !selectedEvent?.supabaseId) return;
    void syncJudgeEventLive(eventId);
  }, [isJudgeView, eventId, selectedEvent?.supabaseId]);

  useEffect(() => {
    if (!eventId || !isSupabaseConfigured() || !selectedEvent) return;

    const syncLive = async () => {
      if (isJudgeView) {
        if (authUserId) {
          await pullAndMergeJudgeEvents(authUserId);
        }
        await syncJudgeEventLive(eventId);

        const snapshots = await fetchLiveTimingSnapshots(eventId);
        const cloudRuns = snapshots.length
          ? buildRunsFromSnapshots(snapshots, eventId, participants, segments)
          : new Map();

        setRuns((prev) => {
          const next = { ...prev };
          let changed = false;
          for (const [key, { run: cloudRun, updatedAt }] of cloudRuns) {
            const local = prev[key];
            const cloudUpdatedAt = new Date(updatedAt).getTime();
            if (
              !isCloudTimingAhead(local, cloudRun, cloudUpdatedAt, localTouchedAtRef.current[key])
            ) {
              continue;
            }
            next[key] = cloudRun;
            changed = true;
          }
          for (const participant of participants) {
            if (participant.status !== 'racing') continue;
            const key = participantKey(participant);
            if (next[key]) continue;
            const startedAt = participant.racingStartedAt
              ? new Date(participant.racingStartedAt).getTime()
              : Date.now();
            next[key] = createHeatTimingRun(participant, startedAt, segments);
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
      if (!snapshots.length) return;

      const cloudRuns = buildRunsFromSnapshots(
        snapshots,
        eventId,
        participants,
        segments,
      );
      if (!cloudRuns.size) return;

      setRuns((prev) => {
        let next = { ...prev };
        let changed = false;
        for (const [key, { run: cloudRun, updatedAt }] of cloudRuns) {
          const local = prev[key];
          const cloudUpdatedAt = new Date(updatedAt).getTime();
          if (
            !isCloudTimingAhead(local, cloudRun, cloudUpdatedAt, localTouchedAtRef.current[key])
          ) {
            continue;
          }
          next[key] = cloudRun;
          changed = true;
        }
        return changed ? next : prev;
      });
    };

    void syncLive();
    const id = setInterval(() => void syncLive(), 2000);
    return () => clearInterval(id);
  }, [
    eventId,
    selectedEvent,
    participants,
    segments,
    isJudgeView,
    judgeStationOrder,
    isJudgeMode,
    authUserId,
  ]);

  function handleEventChange(id: string) {
    setPickedEventId(id);
    setSearch('');
    setRuns({});
    setActiveKey(null);
    localTouchedAtRef.current = {};
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
      await pushTimingRunState(selectedEvent, run, segments, Date.now());
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
        await pushEventToSupabase(eventId);
        const freshEvent = useEventsStore.getState().events.find((e) => e.id === eventId);
        await startLiveRunInCloud(freshEvent ?? selectedEvent, participant, startedAtIso);
      } catch {
        // mantém cronômetro local mesmo se a nuvem falhar
      }
    }
  }

  function startHeat(heatId: string) {
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
    const batch = participantsForHeat(participants, heat);
    if (batch.length === 0) {
      Alert.alert(
        'Bateria',
        'Nenhum atleta vinculado a esta bateria. O organizador deve vincular atletas em Baterias.',
      );
      return;
    }
    const startedAt = Date.now();
    batch.forEach((p) => {
      void startParticipant(p, startedAt);
    });
  }

  function scrollToTimerPanel() {
    if (Platform.OS !== 'web' || !timerPanelRef.current) return;
    const node = timerPanelRef.current as unknown as HTMLElement;
    node.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
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
    touchRun(key);
    setRuns((prev) => {
      const next = { ...prev, [key]: nextRun };
      if (
        isJudgeView &&
        judgeStationOrder != null &&
        !isParticipantVisibleToJudge(nextRun, segments, judgeStationOrder)
      ) {
        delete next[key];
        const remaining = Object.keys(next);
        setActiveKey(remaining[0] ?? null);
      }
      return next;
    });
    void syncRunToCloud(nextRun);
  }

  function handleReceiveAtStation() {
    if (!activeKey || !activeRun || !isJudgeView || judgeStationOrder == null) return;
    const nextRun = receiveAthleteAtStation(activeRun, segments, judgeStationOrder, now);
    if (!nextRun) return;
    applyRunUpdate(activeKey, nextRun);
  }

  function handleReleaseFromStation() {
    if (!activeKey || !activeRun || !isJudgeView || judgeStationOrder == null) return;
    const segment = segments[activeRun.segmentIndex];
    if (!segment || segment.type !== 'station') return;
    const segMs = getSegmentMs(activeRun, now);
    if (segMs === 0 && !isSegmentRunning(activeRun)) return;
    const nextRun = releaseAthleteFromStation(activeRun, segment.id, segments, now);
    applyRunUpdate(activeKey, nextRun);
  }

  function handleNextSegment() {
    if (!isOrganizer || !activeKey || !activeRun) return;
    const segment = segments[activeRun.segmentIndex];
    if (!segment) return;
    const nextRun = advanceSegment(activeRun, segment.id, now, segments.length);
    applyRunUpdate(activeKey, nextRun);
  }

  function handleTogglePause() {
    if (!activeKey || !activeRun || activeRun.raceComplete) return;
    if (!isOrganizer && !isJudgeView) return;
    const nextRun = toggleSegmentRun(activeRun, now);
    applyRunUpdate(activeKey, nextRun);
  }

  function handleToggleTotalPause() {
    if (!isOrganizer || !activeKey || !activeRun || activeRun.raceComplete) return;
    const nextRun = toggleTotalTimePause(activeRun, now);
    applyRunUpdate(activeKey, nextRun);
  }

  function goToRanking(savedEventId: string, savedCategoryId: string) {
    router.push(
      `/(tabs)/leaderboard?eventId=${encodeURIComponent(savedEventId)}&categoryId=${encodeURIComponent(savedCategoryId)}`,
    );
  }

  function handleSaveFinish() {
    if (!isOrganizer || !activeRun || !eventId || !activeKey) return;
    const { participant } = activeRun;
    const result = recordParticipantFinish(
      eventId,
      participant.id,
      participant.type,
      getTotalMs(activeRun, now),
      activeRun.segmentTimes,
    );
    if (!result.ok) {
      Alert.alert('Não foi possível salvar', result.reason);
      return;
    }
    stopTracking(activeKey);
    goToRanking(eventId, participant.categoryId);
  }

  function renderActiveTimer() {
    if (!activeRun || !activeParticipant) return null;

    const stationSegment =
      isJudgeView && judgeStationOrder != null
        ? segments.find((s) => s.order === judgeStationOrder && s.type === 'station')
        : undefined;
    const atJudgeStation =
      isJudgeView &&
      judgeStationOrder != null &&
      isParticipantAtStation(activeRun, segments, judgeStationOrder);
    const segment = atJudgeStation
      ? segments[activeRun.segmentIndex]
      : stationSegment ?? segments[activeRun.segmentIndex];
    const segmentMs = atJudgeStation || !isJudgeView ? getSegmentMs(activeRun, now) : 0;
    const totalMs = getTotalMs(activeRun, now);
    const segmentRunning = isSegmentRunning(activeRun);
    const totalPaused = isTotalTimePaused(activeRun);

    return (
      <View ref={timerPanelRef} style={styles.timerSection} collapsable={false}>
        {activeRun.raceComplete ? (
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
                      currentIndex={activeRun.segmentIndex}
                      completedIndices={activeRun.completed}
                    />
                  </View>
                )}

                <View style={styles.timerCard}>
                  {isJudgeView && !atJudgeStation && (
                    <Text style={styles.runIntervalHint}>
                      Quando o atleta chegar, inicie o cronômetro desta estação.
                    </Text>
                  )}
                  {isJudgeView && atJudgeStation && (
                    <Text style={styles.runIntervalHint}>
                      Tempo nesta estação — encerre quando o atleta sair.
                    </Text>
                  )}
                  <TimerDisplay
                    elapsedMs={segmentMs}
                    segmentName={segment.name}
                    segmentTarget={segment.target}
                    segmentType={segment.type}
                    segmentIndex={segment.order}
                    totalSegments={segments.length}
                  />
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Tempo total</Text>
                    <Text style={styles.totalValue}>{formatMs(totalMs)}</Text>
                  </View>
                  {totalPaused && (
                    <Text style={styles.pausedHint}>Tempo total pausado</Text>
                  )}
                  {!totalPaused && !segmentRunning && segmentMs > 0 && !activeRun.raceComplete && (
                    <Text style={styles.pausedHint}>Segmento pausado</Text>
                  )}
                </View>

                {(isOrganizer || (isJudgeView && atJudgeStation)) &&
                  !activeRun.raceComplete &&
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

                {isJudgeView && judgeActions?.canReceive && (
                  <Button
                    label="Atleta chegou — iniciar cronômetro"
                    onPress={handleReceiveAtStation}
                    large
                    style={{ marginBottom: 8 }}
                  />
                )}
                {isJudgeView && judgeActions?.canRelease && (
                  <Button
                    label="Encerrar estação e registrar tempo"
                    onPress={handleReleaseFromStation}
                    disabled={segmentMs === 0 && !segmentRunning}
                    large
                    style={{ marginBottom: 8 }}
                  />
                )}
                {isOrganizer && !activeRun.raceComplete && (
                  <Button
                    label={totalPaused ? 'Retomar tempo total' : 'Pausar tempo total'}
                    variant={totalPaused ? 'primary' : 'secondary'}
                    onPress={handleToggleTotalPause}
                    large
                    style={{ marginBottom: 8 }}
                  />
                )}
                {isOrganizer && !activeRun.raceComplete && !totalPaused && (
                  <Button
                    label="Próximo segmento →"
                    onPress={handleNextSegment}
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

  if (events.length === 0) {
    return (
      <Screen>
        <Text style={styles.heading}>Cronômetro</Text>
        <Text style={styles.empty}>Crie um evento para usar o cronômetro.</Text>
      </Screen>
    );
  }

  if (timingEvents.length === 0) {
    return (
      <Screen>
        <Text style={styles.heading}>Cronômetro</Text>
        <Text style={styles.empty}>
          {isJudgeMode
            ? 'Nenhum evento em andamento no momento. Aguarde o organizador iniciar a bateria (o evento pode estar em inscrições ou ao vivo).'
            : 'Nenhum evento com inscrições abertas ou ao vivo. Coloque o evento em "Ao vivo" ou "Inscrições" para cronometrar.'}
        </Text>
      </Screen>
    );
  }

  const sidebar = (
    <>
      {runList.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Em prova ({runList.length})</Text>
          <Text style={styles.hint}>
            Toque no atleta para ver o cronômetro e os botões de controle logo abaixo.
          </Text>
          {runList.map((run) => {
            const key = participantKey(run.participant);
            const isActive = key === activeKey;
            const liveTotal = getTotalMs(run, now);
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

      {!wide && activeRun && renderActiveTimer()}

      {!activeRun && runList.length > 0 && (
        <Text style={styles.hint}>Selecione um participante na lista acima.</Text>
      )}

      {(selectedEvent?.heats ?? []).length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Baterias</Text>
          {isJudgeView && (
            <Text style={styles.hint}>
              O organizador inicia a bateria. Toque no atleta quando ele entrar na sua estação e
              inicie o cronômetro. Encerre ao sair para registrar o tempo.
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
                  <Text style={styles.heatAthletes}>
                    {assigned.map((p) => `#${p.bib} ${p.label}`).join(' · ')}
                  </Text>
                )}
                {isOrganizer && (
                  <Button
                    label={heat.startedAt ? 'Reiniciar bateria' : 'Iniciar bateria'}
                    variant="primary"
                    onPress={() => startHeat(heat.id)}
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

      {isJudgeView && judgeStationOrder != null && runList.length === 0 && (
        <View style={styles.section}>
          <Text style={styles.hint}>
            Estação: {stationLabel(segments, judgeStationOrder)}
          </Text>
          <Text style={styles.empty}>
            Nenhum atleta em prova ainda. Assim que o organizador iniciar a bateria, eles
            aparecem aqui para você apontar o tempo da estação.
          </Text>
        </View>
      )}

      {isOrganizer && (
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
                ? `Sua estação: ${stationLabel(segments, judgeStationOrder)}. Inicie o cronômetro quando o atleta chegar e encerre ao sair.`
                : 'Aguardando o organizador designar sua estação. Enquanto isso, você vê a prova em andamento.'
              : isOrganizer
                ? 'Visão do organizador: todos os atletas, todas as estações. Inicie baterias ou avance segmentos manualmente.'
                : 'Inicie a bateria. Todos os atletas seguem a ordem do percurso. Juízes cronometram cada estação.'}
          </Text>

          <Text style={styles.label}>Evento</Text>
          <View style={styles.chipRow}>
            {timingEvents.map((event) => (
              <Pressable
                key={event.id}
                style={[styles.chip, eventId === event.id && styles.chipActive]}
                onPress={() => handleEventChange(event.id)}>
                <Text
                  style={[styles.chipText, eventId === event.id && styles.chipTextActive]}
                  numberOfLines={1}>
                  {event.name}
                </Text>
              </Pressable>
            ))}
          </View>

          {wide && renderActiveTimer()}
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: HyroxTheme.surface,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
    maxWidth: '100%',
  },
  chipActive: { backgroundColor: HyroxTheme.accent, borderColor: HyroxTheme.accent },
  chipText: { color: HyroxTheme.textMuted, fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: '#000' },
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
  pausedHint: {
    color: HyroxTheme.warning,
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
