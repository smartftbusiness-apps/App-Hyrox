import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { HyroxTheme } from '@/constants/Theme';
import { useAthletesByEvent, usePairsByEvent } from '@/src/stores/athletesStore';
import { useEvents } from '@/src/stores/eventsStore';
import { isDoublesCategory } from '@/src/utils/categoryHelpers';
import { genderLabel, getCategoryDisplayName } from '@/src/utils/categoryLabel';
import { formatMs } from '@/src/utils/formatTime';
import {
  buildLeaderboardForCategory,
  buildLeaderboardForDoubles,
} from '@/src/utils/leaderboard';
import { getUnpairedAthletes } from '@/src/utils/pairHelpers';

const MEDAL_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];

const STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  open: 'Inscrições',
  live: 'Ao vivo',
  finished: 'Evento encerrado',
};

export default function LeaderboardScreen() {
  const params = useLocalSearchParams<{ eventId?: string; categoryId?: string }>();
  const events = useEvents();
  const [pickedEventId, setPickedEventId] = useState<string | null>(null);
  const [pickedCategoryId, setPickedCategoryId] = useState<string | null>(null);

  useEffect(() => {
    if (params.eventId) setPickedEventId(String(params.eventId));
    if (params.categoryId) setPickedCategoryId(String(params.categoryId));
  }, [params.eventId, params.categoryId]);

  const eventId = pickedEventId ?? events[0]?.id ?? '';
  const selectedEvent = events.find((e) => e.id === eventId);
  const athletes = useAthletesByEvent(eventId || undefined);
  const pairs = usePairsByEvent(eventId || undefined);

  const categoryId =
    pickedCategoryId && selectedEvent?.categories.some((c) => c.id === pickedCategoryId)
      ? pickedCategoryId
      : (selectedEvent?.categories[0]?.id ?? '');

  const selectedCategory = selectedEvent?.categories.find((c) => c.id === categoryId);

  const isDoubles = selectedCategory ? isDoublesCategory(selectedCategory) : false;

  const eventSegments = selectedEvent?.segments ?? [];

  const entries = useMemo(() => {
    if (!selectedCategory) return [];
    if (isDoublesCategory(selectedCategory)) {
      return buildLeaderboardForDoubles(
        pairs,
        athletes,
        selectedCategory.id,
        selectedCategory.name,
        eventSegments,
      );
    }
    return buildLeaderboardForCategory(
      athletes,
      selectedCategory.id,
      selectedCategory.name,
      eventSegments,
    );
  }, [athletes, pairs, selectedCategory, eventSegments]);

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const pendingCount = useMemo(() => {
    if (!categoryId || !selectedCategory) return 0;
    if (isDoublesCategory(selectedCategory)) {
      const unpaired = getUnpairedAthletes(athletes, categoryId).length;
      const pairsWithoutTime = pairs.filter(
        (p) => p.categoryId === categoryId && p.totalMs == null,
      ).length;
      return unpaired + pairsWithoutTime;
    }
    return athletes.filter(
      (a) =>
        a.categoryId === categoryId &&
        !a.pairId &&
        a.totalMs == null &&
        a.status !== 'dnf' &&
        a.status !== 'dns',
    ).length;
  }, [athletes, pairs, categoryId, selectedCategory]);

  if (events.length === 0) {
    return (
      <Screen>
        <Text style={styles.heading}>Ranking</Text>
        <Text style={styles.empty}>Crie um evento para ver o ranking.</Text>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Text style={styles.heading}>Ranking</Text>
      {selectedEvent && (
        <Text style={styles.subheading}>
          {selectedEvent.name} · {STATUS_LABELS[selectedEvent.status] ?? selectedEvent.status}
        </Text>
      )}

      <Text style={styles.label}>Evento</Text>
      <View style={styles.tabs}>
        {events.map((event) => (
          <Pressable
            key={event.id}
            style={[styles.tab, eventId === event.id && styles.tabActive]}
            onPress={() => {
              setPickedEventId(event.id);
              setPickedCategoryId(null);
            }}>
            <Text
              style={[styles.tabText, eventId === event.id && styles.tabTextActive]}
              numberOfLines={1}>
              {event.name}
            </Text>
          </Pressable>
        ))}
      </View>

      {selectedEvent && selectedEvent.categories.length > 0 && (
        <>
          <Text style={styles.label}>Categoria</Text>
          <View style={styles.tabs}>
            {selectedEvent.categories.map((cat) => (
              <Pressable
                key={cat.id}
                style={[styles.tab, categoryId === cat.id && styles.tabActive]}
                onPress={() => setPickedCategoryId(cat.id)}>
                <Text style={[styles.tabText, categoryId === cat.id && styles.tabTextActive]}>
                  {cat.gender === 'M' ? 'Masc' : cat.gender === 'F' ? 'Fem' : 'Misto'}{' '}
                  {cat.division}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {selectedCategory && (
        <>
          <Text style={styles.categoryTitle}>
            {getCategoryDisplayName(selectedCategory)}
            {isDoubles ? ` · ${genderLabel(selectedCategory.gender)} · Ranking de duplas` : ''}
          </Text>
          {entries.some((e) => e.splits.length > 0) && (
            <Text style={styles.splitsHint}>Toque no participante para ver parciais por estação</Text>
          )}
        </>
      )}

      {entries.map((entry) => {
        const isExpanded = expandedId === entry.athleteId;
        const hasSplits = entry.splits.length > 0;
        return (
          <View key={entry.athleteId} style={styles.entryCard}>
            <Pressable
              style={styles.row}
              onPress={() => {
                if (hasSplits) {
                  setExpandedId(isExpanded ? null : entry.athleteId);
                }
              }}>
              <View style={styles.rankCol}>
                {entry.rank <= 3 ? (
                  <View style={[styles.medal, { backgroundColor: MEDAL_COLORS[entry.rank - 1] + '33' }]}>
                    <Text style={[styles.medalText, { color: MEDAL_COLORS[entry.rank - 1] }]}>
                      {entry.rank}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.rank}>{entry.rank}</Text>
                )}
              </View>
              <View style={styles.info}>
                <Text style={styles.name}>
                  #{entry.bib} {entry.name}
                </Text>
                {hasSplits && (
                  <Text style={styles.expandHint}>
                    {isExpanded ? 'Ocultar parciais' : `${entry.splits.length} parciais`}
                  </Text>
                )}
              </View>
              <Text style={styles.time}>{formatMs(entry.totalMs)}</Text>
            </Pressable>
            {isExpanded &&
              entry.splits.map((split) => (
                <View key={split.segmentId} style={styles.splitRow}>
                  <Text style={styles.splitOrder}>{split.segmentOrder}</Text>
                  <View style={styles.splitInfo}>
                    <Text style={styles.splitName}>{split.segmentName}</Text>
                    <Text style={styles.splitType}>
                      {split.segmentType === 'run' ? 'Corrida' : 'Estação'}
                    </Text>
                  </View>
                  <Text style={styles.splitTime}>{formatMs(split.durationMs)}</Text>
                </View>
              ))}
          </View>
        );
      })}

      {entries.length === 0 && (
        <Text style={styles.empty}>
          Nenhum resultado finalizado nesta categoria ainda.
          {pendingCount > 0
            ? `\n${pendingCount} ${isDoubles ? 'dupla(s)/atleta(s)' : 'atleta(s)'} aguardando tempo.`
            : ''}
        </Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { color: HyroxTheme.text, fontSize: 28, fontWeight: '800' },
  subheading: { color: HyroxTheme.textMuted, fontSize: 14, marginTop: 4, marginBottom: 16 },
  label: { color: HyroxTheme.text, fontSize: 14, fontWeight: '600', marginBottom: 8 },
  categoryTitle: {
    color: HyroxTheme.accent,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
    marginTop: 4,
  },
  splitsHint: {
    color: HyroxTheme.textMuted,
    fontSize: 12,
    marginBottom: 12,
  },
  entryCard: {
    backgroundColor: HyroxTheme.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
    marginBottom: 8,
    overflow: 'hidden',
  },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: HyroxTheme.surface,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
    maxWidth: '100%',
  },
  tabActive: { backgroundColor: HyroxTheme.accent, borderColor: HyroxTheme.accent },
  tabText: { color: HyroxTheme.textMuted, fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#000' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  rankCol: { width: 36, alignItems: 'center' },
  rank: { color: HyroxTheme.textMuted, fontSize: 16, fontWeight: '700' },
  medal: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalText: { fontSize: 14, fontWeight: '800' },
  info: { flex: 1, marginLeft: 8 },
  name: { color: HyroxTheme.text, fontSize: 15, fontWeight: '600' },
  expandHint: { color: HyroxTheme.textMuted, fontSize: 11, marginTop: 2 },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingRight: 14,
    paddingLeft: 52,
    borderTopWidth: 1,
    borderTopColor: HyroxTheme.border,
    backgroundColor: HyroxTheme.surfaceElevated,
  },
  splitOrder: {
    color: HyroxTheme.textMuted,
    fontSize: 12,
    fontWeight: '700',
    width: 22,
  },
  splitInfo: { flex: 1, marginLeft: 8 },
  splitName: { color: HyroxTheme.textMuted, fontSize: 13 },
  splitType: { color: HyroxTheme.textMuted, fontSize: 10, marginTop: 1, opacity: 0.8 },
  splitTime: {
    color: HyroxTheme.text,
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  time: {
    color: HyroxTheme.accent,
    fontSize: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  empty: {
    color: HyroxTheme.textMuted,
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 22,
  },
});
