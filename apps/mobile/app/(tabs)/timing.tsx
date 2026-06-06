import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
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
import type { TimingParticipant } from '@/src/utils/participantHelpers';
import { buildTimingParticipants, participantsForHeat } from '@/src/utils/participantHelpers';
import { formatMs } from '@/src/utils/formatTime';
import {
  advanceSegment,
  addPenalty,
  createTimingRun,
  getSegmentMs,
  getTotalMs,
  isSegmentRunning,
  participantKey,
  toggleSegmentRun,
  type TimingRunState,
} from '@/src/utils/timingRun';

function canControlEventTiming(event: HyroxEvent): boolean {
  const owner = useOrganizerStore.getState().isEventOwner(event.organizerId);
  const judge = useEventStaffStore.getState().isAssignedJudge(event.id);
  return owner || judge;
}

export default function TimingScreen() {
  const events = useEvents();
  const markHeatStarted = useEventsStore((s) => s.markHeatStarted);
  const timingEvents = useMemo(
    () =>
      events.filter(
        (e) =>
          (e.status === 'live' || e.status === 'open') && canControlEventTiming(e),
      ),
    [events],
  );

  const [pickedEventId, setPickedEventId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [runs, setRuns] = useState<Record<string, TimingRunState>>({});
  const [now, setNow] = useState(Date.now());

  const setParticipantStatus = useAthletesStore((s) => s.setParticipantStatus);
  const recordParticipantFinish = useAthletesStore((s) => s.recordParticipantFinish);

  const eventId = pickedEventId ?? timingEvents[0]?.id ?? '';
  const selectedEvent = timingEvents.find((e) => e.id === eventId);
  const athletes = useAthletesByEvent(eventId || undefined);
  const pairs = usePairsByEvent(eventId || undefined);

  const participants = useMemo(() => {
    if (!selectedEvent) return [];
    return buildTimingParticipants(athletes, pairs, selectedEvent.categories);
  }, [athletes, pairs, selectedEvent]);

  const segments = selectedEvent?.segments ?? [];
  const activeRun = activeKey ? runs[activeKey] : undefined;
  const activeParticipant = activeRun?.participant;

  const runList = useMemo(
    () => Object.values(runs).sort((a, b) => a.participant.bib - b.participant.bib),
    [runs],
  );

  const availableParticipants = useMemo(() => {
    const q = search.toLowerCase().trim();
    return participants.filter((p) => {
      const key = participantKey(p);
      if (runs[key]) return false;
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

  function handleEventChange(id: string) {
    setPickedEventId(id);
    setSearch('');
    setRuns({});
    setActiveKey(null);
  }

  function updateRun(key: string, updater: (run: TimingRunState) => TimingRunState) {
    setRuns((prev) => {
      const run = prev[key];
      if (!run) return prev;
      return { ...prev, [key]: updater(run) };
    });
  }

  function startParticipant(participant: TimingParticipant) {
    if (!eventId) return;
    const key = participantKey(participant);
    if (runs[key]) {
      setActiveKey(key);
      return;
    }
    setRuns((prev) => ({ ...prev, [key]: createTimingRun(participant) }));
    setActiveKey(key);
    const result = setParticipantStatus(eventId, participant.id, participant.type, 'racing');
    if (!result.ok) Alert.alert('Cronômetro', result.reason);
  }

  function startHeat(heatId: string) {
    if (!eventId || !selectedEvent) return;
    const heat = (selectedEvent.heats ?? []).find((h) => h.id === heatId);
    if (!heat) return;
    const mark = markHeatStarted(eventId, heatId);
    if (!mark.ok) {
      Alert.alert('Bateria', mark.reason);
      return;
    }
    const batch = participantsForHeat(participants, heat);
    if (batch.length === 0) {
      Alert.alert('Bateria', 'Nenhum participante elegível nesta bateria.');
      return;
    }
    for (const p of batch) {
      startParticipant(p);
    }
  }

  function selectActive(key: string) {
    setActiveKey(key);
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

  function handleToggleSegment() {
    if (!activeKey) return;
    updateRun(activeKey, (run) => toggleSegmentRun(run, now));
  }

  function handleNextSegment() {
    if (!activeKey || !activeRun) return;
    const segment = segments[activeRun.segmentIndex];
    if (!segment) return;
    const segMs = getSegmentMs(activeRun, now);
    if (segMs === 0 && !isSegmentRunning(activeRun)) return;

    updateRun(activeKey, (run) => advanceSegment(run, segment.id, now, segments.length));
  }

  function handlePenalty() {
    if (!activeKey) return;
    updateRun(activeKey, (run) => addPenalty(run));
  }

  function goToRanking(savedEventId: string, savedCategoryId: string) {
    router.push(
      `/(tabs)/leaderboard?eventId=${encodeURIComponent(savedEventId)}&categoryId=${encodeURIComponent(savedCategoryId)}`,
    );
  }

  function handleSaveFinish() {
    if (!activeRun || !eventId || !activeKey) return;
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
          Nenhum evento com inscrições abertas ou ao vivo. Coloque o evento em &quot;Ao vivo&quot;
          ou &quot;Inscrições&quot; para cronometrar.
        </Text>
      </Screen>
    );
  }

  const segment = activeRun ? segments[activeRun.segmentIndex] : undefined;
  const segmentMs = activeRun ? getSegmentMs(activeRun, now) : 0;
  const totalMs = activeRun ? getTotalMs(activeRun, now) : 0;
  const segmentRunning = activeRun ? isSegmentRunning(activeRun) : false;

  return (
    <Screen scroll>
      <Text style={styles.heading}>Cronômetro</Text>
      <Text style={styles.subheading}>
        Juiz — inicie vários participantes e alterne entre eles. Os tempos continuam rodando.
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

      {(selectedEvent?.heats ?? []).length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Baterias</Text>
          {(selectedEvent?.heats ?? []).map((heat) => (
            <View key={heat.id} style={styles.heatRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.participantName}>{heat.name}</Text>
                <Text style={styles.participantMeta}>
                  {new Date(heat.scheduledStartAt).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {heat.startedAt ? ' · iniciada' : ''}
                </Text>
              </View>
              <Button
                label={heat.startedAt ? 'Reiniciar' : 'Iniciar bateria'}
                variant="primary"
                onPress={() => startHeat(heat.id)}
              />
            </View>
          ))}
        </View>
      )}

      {runList.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Em prova ({runList.length})</Text>
          {runList.map((run) => {
            const key = participantKey(run.participant);
            const isActive = key === activeKey;
            const liveTotal = getTotalMs(run, now);
            return (
              <Pressable
                key={key}
                style={[styles.runRow, isActive && styles.runRowActive]}
                onPress={() => selectActive(key)}>
                <Text style={styles.participantBib}>#{run.participant.bib}</Text>
                <View style={styles.participantInfo}>
                  <Text style={styles.participantName} numberOfLines={1}>
                    {run.participant.label}
                  </Text>
                  <Text style={styles.participantMeta} numberOfLines={1}>
                    {run.participant.type === 'pair' ? 'Dupla' : 'Individual'} ·{' '}
                    {run.participant.categoryName}
                    {run.raceComplete ? ' · Aguardando salvar' : ''}
                  </Text>
                </View>
                <Text style={styles.liveTime}>{formatMs(liveTotal)}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {activeRun && activeParticipant && (
        <View style={styles.timerSection}>
          {activeRun.raceComplete ? (
            <View style={styles.finishedCard}>
              <Text style={styles.finishedTitle}>Prova finalizada</Text>
              <Text style={styles.finishedTime}>{formatMs(totalMs)}</Text>
              <Text style={styles.finishedSub}>
                #{activeParticipant.bib} {activeParticipant.label}
              </Text>
              <Button
                label="Salvar tempo no ranking"
                onPress={handleSaveFinish}
                large
                style={{ marginTop: 16, width: '100%' }}
              />
            </View>
          ) : (
            <>
              <View style={styles.participantBanner}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.athlete}>
                    #{activeParticipant.bib} {activeParticipant.label}
                  </Text>
                  <Text style={styles.athleteMeta}>
                    {selectedEvent?.name} · {activeParticipant.categoryName}
                  </Text>
                </View>
              </View>

              {segments.length > 0 && segment && (
                <>
                  <SegmentProgress
                    segments={segments}
                    currentIndex={activeRun.segmentIndex}
                    completedIndices={activeRun.completed}
                  />

                  <View style={styles.timerCard}>
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
                  </View>

                  <View style={styles.actions}>
                    <Button
                      label={
                        segmentRunning
                          ? 'Pausar segmento'
                          : segmentMs > 0
                            ? 'Retomar segmento'
                            : 'Iniciar segmento'
                      }
                      onPress={handleToggleSegment}
                      large
                      style={styles.actionBtn}
                    />
                    <Button
                      label="Próximo segmento →"
                      variant="secondary"
                      onPress={handleNextSegment}
                      disabled={segmentMs === 0 && !segmentRunning}
                      large
                      style={styles.actionBtn}
                    />
                  </View>

                  <Button
                    label="+2 min penalidade"
                    variant="danger"
                    onPress={handlePenalty}
                    style={{ marginTop: 8 }}
                  />
                </>
              )}

              {segments.length === 0 && (
                <Text style={styles.empty}>Este evento não tem segmentos configurados.</Text>
              )}
            </>
          )}
        </View>
      )}

      {!activeRun && runList.length > 0 && (
        <Text style={styles.hint}>Toque em um participante na lista para ver o cronômetro.</Text>
      )}

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
          <View key={participantKey(p)} style={styles.participantRow}>
            <Text style={styles.participantBib}>#{p.bib}</Text>
            <View style={styles.participantInfo}>
              <Text style={styles.participantName}>{p.label}</Text>
              <Text style={styles.participantMeta}>
                {p.type === 'pair' ? `Dupla · ${p.memberNames.join(' + ')}` : 'Individual'} ·{' '}
                {p.categoryName}
              </Text>
            </View>
            <Pressable style={styles.startBtn} onPress={() => startParticipant(p)}>
              <Text style={styles.startBtnText}>Iniciar</Text>
            </Pressable>
          </View>
        ))}

        {availableParticipants.length === 0 && participants.length > 0 && runList.length > 0 && (
          <Text style={styles.hint}>Todos os participantes filtrados já estão em prova.</Text>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { color: HyroxTheme.text, fontSize: 28, fontWeight: '800' },
  subheading: { color: HyroxTheme.textMuted, fontSize: 14, marginTop: 4, marginBottom: 16 },
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
  timerSection: { marginBottom: 20 },
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
  },
  runRowActive: {
    borderColor: HyroxTheme.accent,
    backgroundColor: 'rgba(255, 237, 0, 0.08)',
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
  },
  participantBib: { color: HyroxTheme.accent, fontWeight: '800', fontSize: 14, width: 48 },
  participantInfo: { flex: 1 },
  participantName: { color: HyroxTheme.text, fontSize: 15, fontWeight: '600' },
  participantMeta: { color: HyroxTheme.textMuted, fontSize: 12, marginTop: 2 },
  liveTime: {
    color: HyroxTheme.text,
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  startBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: HyroxTheme.accent,
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
  actions: { gap: 10 },
  actionBtn: { width: '100%' },
  finishedCard: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: HyroxTheme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
  },
  finishedTitle: { color: HyroxTheme.text, fontSize: 20, fontWeight: '800' },
  finishedTime: {
    color: HyroxTheme.accent,
    fontSize: 40,
    fontWeight: '800',
    marginTop: 12,
    fontVariant: ['tabular-nums'],
  },
  finishedSub: { color: HyroxTheme.textMuted, fontSize: 14, marginTop: 8 },
  hint: { color: HyroxTheme.textMuted, fontSize: 13, marginBottom: 12, lineHeight: 18 },
  empty: { color: HyroxTheme.textMuted, textAlign: 'center', marginTop: 12 },
  heatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: HyroxTheme.border,
  },
});
