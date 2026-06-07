import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
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
import { fetchAndApplyLiveRuns, startLiveRunInCloud } from '@/src/api/liveTimingRepository';
import { pullEventParticipantsLive, pushEventToSupabase } from '@/src/api/syncService';
import { isSupabaseConfigured } from '@/src/lib/supabase';
import {
  advanceSegment,
  addPenalty,
  createTimingRun,
  createTimingRunAt,
  getSegmentMs,
  getTotalMs,
  isSegmentRunning,
  participantKey,
  type TimingRunState,
} from '@/src/utils/timingRun';

function canControlEventTiming(event: HyroxEvent): boolean {
  const owner = useOrganizerStore.getState().isEventOwner(event.organizerId);
  const judge = useEventStaffStore.getState().isAssignedJudge(event.id);
  return owner || judge;
}

export default function TimingScreen() {
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, 720);
  const narrow = contentWidth < 380;
  const compact = contentWidth < 420;
  const wide = contentWidth >= 720;
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
  const isOrganizer = useOrganizerStore((s) =>
    selectedEvent ? s.isEventOwner(selectedEvent.organizerId) : false,
  );
  const athletes = useAthletesByEvent(eventId || undefined);
  const pairs = usePairsByEvent(eventId || undefined);

  const participants = useMemo(() => {
    if (!selectedEvent) return [];
    return buildTimingParticipants(athletes, pairs, selectedEvent.categories);
  }, [athletes, pairs, selectedEvent]);

  const segments = selectedEvent?.segments ?? [];

  const runList = useMemo(() => {
    const byKey = new Map<string, TimingRunState>();
    for (const run of Object.values(runs)) {
      byKey.set(participantKey(run.participant), run);
    }
    for (const p of participants) {
      if (p.status !== 'racing') continue;
      const key = participantKey(p);
      const startedMs = p.racingStartedAt ? new Date(p.racingStartedAt).getTime() : Date.now();
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, createTimingRunAt(p, startedMs));
        continue;
      }
      if (p.racingStartedAt) {
        const remoteStart = new Date(p.racingStartedAt).getTime();
        if (remoteStart < existing.raceStartedAt) {
          const delta = existing.raceStartedAt - remoteStart;
          byKey.set(key, {
            ...existing,
            participant: p,
            raceStartedAt: remoteStart,
            segmentStartedAt: existing.segmentStartedAt
              ? existing.segmentStartedAt - delta
              : remoteStart,
          });
        } else {
          byKey.set(key, { ...existing, participant: p });
        }
      }
    }
    return [...byKey.values()].sort((a, b) => a.participant.bib - b.participant.bib);
  }, [runs, participants]);

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
    if (!eventId || !isSupabaseConfigured()) return;
    const syncLive = async () => {
      await pullEventParticipantsLive(eventId);
      await fetchAndApplyLiveRuns(eventId);
    };
    void syncLive();
    const id = setInterval(() => void syncLive(), 2000);
    return () => clearInterval(id);
  }, [eventId]);

  useEffect(() => {
    setRuns((prev) => {
      let next = { ...prev };
      let changed = false;
      for (const run of runList) {
        const key = participantKey(run.participant);
        if (!next[key]) {
          next[key] = run;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [runList]);

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

  async function startParticipant(participant: TimingParticipant) {
    if (!eventId) return;
    const key = participantKey(participant);
    if (runs[key]) {
      setActiveKey(key);
      return;
    }
    setRuns((prev) => ({ ...prev, [key]: createTimingRun(participant) }));
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
        await startLiveRunInCloud(freshEvent ?? selectedEvent, participant);
      } catch {
        // mantém cronômetro local mesmo se a nuvem falhar
      }
    }
  }

  function startHeat(heatId: string) {
    if (!eventId || !selectedEvent || !isOrganizer) return;
    const heat = (selectedEvent.heats ?? []).find((h) => h.id === heatId);
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
    for (const p of batch) {
      startParticipant(p);
    }
  }

  function selectActive(key: string) {
    setActiveKey(key);
    const picked = runList.find((r) => participantKey(r.participant) === key);
    if (picked) {
      setRuns((prev) => (prev[key] ? prev : { ...prev, [key]: picked }));
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

  function renderActiveTimer() {
    if (!activeRun || !activeParticipant) return null;

    const segment = segments[activeRun.segmentIndex];
    const segmentMs = getSegmentMs(activeRun, now);
    const totalMs = getTotalMs(activeRun, now);
    const segmentRunning = isSegmentRunning(activeRun);

    return (
      <View style={styles.timerSection}>
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
              <Text style={styles.athlete} numberOfLines={2}>
                #{activeParticipant.bib} {activeParticipant.label}
              </Text>
              <Text style={styles.athleteMeta} numberOfLines={1}>
                {selectedEvent?.name} · {activeParticipant.categoryName}
              </Text>
            </View>

            {segments.length > 0 && segment ? (
              <>
                <View style={styles.segmentProgressWrap}>
                  <SegmentProgress
                    segments={segments}
                    currentIndex={activeRun.segmentIndex}
                    completedIndices={activeRun.completed}
                  />
                </View>

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

                <Button
                  label="Próximo segmento →"
                  onPress={handleNextSegment}
                  disabled={segmentMs === 0 && !segmentRunning}
                  large
                  style={{ marginBottom: 8 }}
                />

                <Button label="+2 min penalidade" variant="danger" onPress={handlePenalty} />
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
          Nenhum evento com inscrições abertas ou ao vivo. Coloque o evento em &quot;Ao vivo&quot;
          ou &quot;Inscrições&quot; para cronometrar.
        </Text>
      </Screen>
    );
  }

  const sidebar = (
    <>
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
                style={[
                  styles.runRow,
                  compact && styles.runRowCompact,
                  isActive && styles.runRowActive,
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

      {!activeRun && runList.length > 0 && (
        <Text style={styles.hint}>Toque em um participante na lista para ver o cronômetro.</Text>
      )}

      {(selectedEvent?.heats ?? []).length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Baterias</Text>
          {!isOrganizer && (
            <Text style={styles.hint}>
              Apenas o organizador pode iniciar baterias. Você pode iniciar participantes
              individualmente abaixo.
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
                {assigned.length > 0 && (
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
    </>
  );

  return (
    <Screen scroll>
      <View style={[styles.page, wide && styles.pageWide]}>
        <View style={[styles.mainColumn, wide && styles.mainColumnWide]}>
          <Text style={[styles.heading, narrow && styles.headingCompact]}>Cronômetro</Text>
          <Text style={styles.subheading}>
            Controle os tempos dos participantes. Somente o organizador inicia as baterias; juízes
            cronometram atletas individualmente.
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

          {renderActiveTimer()}
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
