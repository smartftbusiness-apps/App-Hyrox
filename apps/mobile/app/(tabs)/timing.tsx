import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { SegmentProgress } from '@/components/SegmentProgress';
import { TimerDisplay } from '@/components/TimerDisplay';
import { HyroxTheme } from '@/constants/Theme';
import { useAthletesByEvent, useAthletesStore, usePairsByEvent } from '@/src/stores/athletesStore';
import { useEvents } from '@/src/stores/eventsStore';
import type { SegmentTime } from '@/src/domain/types';
import type { TimingParticipant } from '@/src/utils/participantHelpers';
import { buildTimingParticipants } from '@/src/utils/participantHelpers';
import { formatMs } from '@/src/utils/formatTime';

const PENALTY_MS = 120_000;

export default function TimingScreen() {
  const events = useEvents();
  const timingEvents = useMemo(
    () => events.filter((e) => e.status === 'live' || e.status === 'open'),
    [events],
  );

  const [pickedEventId, setPickedEventId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedParticipant, setSelectedParticipant] = useState<TimingParticipant | null>(null);

  const [segmentIndex, setSegmentIndex] = useState(0);
  const [completed, setCompleted] = useState<number[]>([]);
  const [segmentMs, setSegmentMs] = useState(0);
  const [totalMs, setTotalMs] = useState(0);
  const [segmentTimes, setSegmentTimes] = useState<SegmentTime[]>([]);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const filteredParticipants = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return participants;
    return participants.filter(
      (p) =>
        p.label.toLowerCase().includes(q) ||
        String(p.bib).includes(q) ||
        p.memberNames.some((n) => n.toLowerCase().includes(q)),
    );
  }, [participants, search]);

  const segments = selectedEvent?.segments ?? [];
  const segment = segments[segmentIndex];
  const isFinished = selectedParticipant != null && segmentIndex >= segments.length;

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSegmentMs((prev) => prev + 100);
        setTotalMs((prev) => prev + 100);
      }, 100);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  function resetTimer() {
    setRunning(false);
    setSegmentIndex(0);
    setCompleted([]);
    setSegmentMs(0);
    setTotalMs(0);
    setSegmentTimes([]);
  }

  function handleSelectParticipant(participant: TimingParticipant) {
    if (running) {
      Alert.alert('Cronômetro ativo', 'Pause ou finalize antes de trocar o participante.');
      return;
    }
    setSelectedParticipant(participant);
    resetTimer();
    if (eventId) {
      setParticipantStatus(eventId, participant.id, participant.type, 'racing');
    }
  }

  function handleChangeParticipant() {
    if (running) {
      Alert.alert('Cronômetro ativo', 'Pause o cronômetro antes de trocar.');
      return;
    }
    setSelectedParticipant(null);
    resetTimer();
  }

  function handleStartStop() {
    if (!selectedParticipant) return;
    setRunning((r) => !r);
  }

  function handleNextSegment() {
    if (!running && segmentMs === 0) return;
    setRunning(false);
    const current = segments[segmentIndex];
    if (current && segmentMs > 0) {
      setSegmentTimes((prev) => [...prev, { segmentId: current.id, durationMs: segmentMs }]);
    }
    setCompleted((prev) => [...prev, segmentIndex]);
    setSegmentMs(0);
    setSegmentIndex((i) => i + 1);
  }

  function handlePenalty() {
    setTotalMs((prev) => prev + PENALTY_MS);
  }

  function goToRanking(savedEventId: string, savedCategoryId: string) {
    router.push(
      `/(tabs)/leaderboard?eventId=${encodeURIComponent(savedEventId)}&categoryId=${encodeURIComponent(savedCategoryId)}`,
    );
  }

  function handleSaveFinish() {
    if (!selectedParticipant || !eventId) return;
    const savedCategoryId = selectedParticipant.categoryId;
    const result = recordParticipantFinish(
      eventId,
      selectedParticipant.id,
      selectedParticipant.type,
      totalMs,
      segmentTimes,
    );
    if (!result.ok) {
      Alert.alert('Não foi possível salvar', result.reason);
      return;
    }
    setSelectedParticipant(null);
    resetTimer();
    goToRanking(eventId, savedCategoryId);
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

  if (!selectedParticipant) {
    return (
      <Screen scroll>
        <Text style={styles.heading}>Cronômetro</Text>
        <Text style={styles.subheading}>Juiz — selecione o evento e o participante</Text>

        <Text style={styles.label}>Evento</Text>
        <View style={styles.chipRow}>
          {timingEvents.map((event) => (
            <Pressable
              key={event.id}
              style={[styles.chip, eventId === event.id && styles.chipActive]}
              onPress={() => {
                setPickedEventId(event.id);
                setSearch('');
              }}>
              <Text
                style={[styles.chipText, eventId === event.id && styles.chipTextActive]}
                numberOfLines={1}>
                {event.name}
              </Text>
            </Pressable>
          ))}
        </View>

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

        {filteredParticipants.map((p) => (
          <Pressable
            key={`${p.type}-${p.id}`}
            style={styles.participantRow}
            onPress={() => handleSelectParticipant(p)}>
            <Text style={styles.participantBib}>#{p.bib}</Text>
            <View style={styles.participantInfo}>
              <Text style={styles.participantName}>{p.label}</Text>
              <Text style={styles.participantMeta}>
                {p.type === 'pair' ? `Dupla · ${p.memberNames.join(' + ')}` : 'Individual'} ·{' '}
                {p.categoryName}
              </Text>
            </View>
            <Text style={styles.selectHint}>Selecionar</Text>
          </Pressable>
        ))}
      </Screen>
    );
  }

  if (isFinished) {
    return (
      <Screen>
        <View style={styles.finished}>
          <Text style={styles.finishedTitle}>Prova finalizada!</Text>
          <Text style={styles.finishedTime}>{formatMs(totalMs)}</Text>
          <Text style={styles.finishedSub}>
            #{selectedParticipant.bib} {selectedParticipant.label}
          </Text>
          <Text style={styles.finishedMeta}>
            {selectedParticipant.type === 'pair'
              ? `Dupla: ${selectedParticipant.memberNames.join(' + ')}`
              : 'Individual'}{' '}
            · {selectedParticipant.categoryName}
          </Text>
          <Button
            label="Salvar tempo no ranking"
            onPress={handleSaveFinish}
            large
            style={{ marginTop: 24, width: '100%' }}
          />
          <Button
            label="Trocar participante"
            variant="secondary"
            onPress={handleChangeParticipant}
            style={{ marginTop: 10, width: '100%' }}
          />
          <Button
            label="Reiniciar"
            variant="secondary"
            onPress={resetTimer}
            style={{ marginTop: 10, width: '100%' }}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Text style={styles.heading}>Cronômetro</Text>
      <View style={styles.participantBanner}>
        <View style={{ flex: 1 }}>
          <Text style={styles.athlete}>
            #{selectedParticipant.bib} {selectedParticipant.label}
          </Text>
          <Text style={styles.athleteMeta}>
            {selectedEvent?.name} · {selectedParticipant.categoryName}
            {selectedParticipant.type === 'pair'
              ? ` · ${selectedParticipant.memberNames.join(' + ')}`
              : ''}
          </Text>
        </View>
        <Pressable onPress={handleChangeParticipant}>
          <Text style={styles.changeLink}>Trocar</Text>
        </Pressable>
      </View>

      {segments.length > 0 && segment && (
        <>
          <SegmentProgress
            segments={segments}
            currentIndex={segmentIndex}
            completedIndices={completed}
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
              label={running ? 'Pausar' : segmentMs > 0 ? 'Retomar' : 'Iniciar segmento'}
              onPress={handleStartStop}
              large
              style={styles.actionBtn}
            />
            <Button
              label="Próximo segmento →"
              variant="secondary"
              onPress={handleNextSegment}
              disabled={segmentMs === 0}
              large
              style={styles.actionBtn}
            />
          </View>

          <Button label="+2 min penalidade" variant="danger" onPress={handlePenalty} style={{ marginTop: 8 }} />
        </>
      )}

      {segments.length === 0 && (
        <Text style={styles.empty}>Este evento não tem segmentos configurados.</Text>
      )}
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
  search: {
    backgroundColor: HyroxTheme.surface,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: HyroxTheme.text,
    fontSize: 15,
    marginBottom: 16,
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
  selectHint: { color: HyroxTheme.accent, fontSize: 12, fontWeight: '700' },
  participantBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
    padding: 12,
    backgroundColor: HyroxTheme.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
  },
  athlete: { color: HyroxTheme.text, fontSize: 16, fontWeight: '700' },
  athleteMeta: { color: HyroxTheme.textMuted, fontSize: 12, marginTop: 4 },
  changeLink: { color: HyroxTheme.accent, fontSize: 13, fontWeight: '600' },
  timerCard: {
    backgroundColor: HyroxTheme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
    marginBottom: 20,
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
  finished: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  finishedTitle: { color: HyroxTheme.text, fontSize: 24, fontWeight: '800' },
  finishedTime: {
    color: HyroxTheme.accent,
    fontSize: 48,
    fontWeight: '800',
    marginTop: 16,
    fontVariant: ['tabular-nums'],
  },
  finishedSub: { color: HyroxTheme.text, fontSize: 16, fontWeight: '600', marginTop: 8 },
  finishedMeta: { color: HyroxTheme.textMuted, fontSize: 13, marginTop: 4, textAlign: 'center' },
  empty: { color: HyroxTheme.textMuted, textAlign: 'center', marginTop: 24 },
});
