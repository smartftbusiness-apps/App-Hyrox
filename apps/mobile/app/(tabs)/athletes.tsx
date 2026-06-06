import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { HyroxTheme } from '@/constants/Theme';
import { useAthletesByEvent, usePairsByEvent } from '@/src/stores/athletesStore';
import { useEvents } from '@/src/stores/eventsStore';
import { getCategoryNameForAthlete } from '@/src/utils/athleteHelpers';
import { formatMs } from '@/src/utils/formatTime';
import { getPairDisplayName } from '@/src/utils/pairHelpers';

const STATUS_LABELS: Record<string, string> = {
  registered: 'Inscrito',
  checked_in: 'Check-in',
  racing: 'Em prova',
  finished: 'Finalizado',
  dnf: 'DNF',
  dns: 'DNS',
};

export default function AthletesScreen() {
  const events = useEvents();
  const [pickedEventId, setPickedEventId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const eventId = pickedEventId ?? events[0]?.id ?? '';
  const selectedEvent = events.find((e) => e.id === eventId);
  const athletes = useAthletesByEvent(eventId || undefined);
  const pairs = usePairsByEvent(eventId || undefined);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const athleteRows = athletes.filter(
      (a) =>
        !a.pairId &&
        (a.name.toLowerCase().includes(q) || String(a.bib).includes(search)),
    );
    const pairRows = pairs
      .map((p) => ({
        pair: p,
        name: getPairDisplayName(p, athletes),
      }))
      .filter(
        (row) =>
          row.name.toLowerCase().includes(q) || String(row.pair.bib).includes(search),
      );
    return { athletes: athleteRows, pairs: pairRows };
  }, [athletes, pairs, search]);

  if (events.length === 0) {
    return (
      <Screen>
        <Text style={styles.heading}>Atletas</Text>
        <Text style={styles.empty}>Crie um evento primeiro para inscrever atletas.</Text>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Text style={styles.heading}>Atletas</Text>
      <Text style={styles.subheading}>Consulta por evento — inscrições só dentro do evento</Text>

      <View style={styles.infoBanner}>
        <Text style={styles.infoText}>
          Atletas só podem ser adicionados em eventos já criados. Abra o evento e use
          &quot;Gerenciar atletas&quot; para inscrever participantes.
        </Text>
      </View>

      <Text style={styles.label}>Evento</Text>
      <View style={styles.eventRow}>
        {events.map((event) => (
          <Pressable
            key={event.id}
            style={[styles.eventChip, eventId === event.id && styles.eventChipActive]}
            onPress={() => setPickedEventId(event.id)}>
            <Text
              style={[
                styles.eventChipText,
                eventId === event.id && styles.eventChipTextActive,
              ]}
              numberOfLines={1}>
              {event.name}
            </Text>
          </Pressable>
        ))}
      </View>

      {selectedEvent && (
        <Button
          label="Abrir evento →"
          variant="secondary"
          onPress={() => router.push(`/event/${selectedEvent.id}`)}
          style={styles.addBtn}
        />
      )}

      <TextInput
        style={styles.search}
        placeholder="Buscar por nome ou bib..."
        placeholderTextColor={HyroxTheme.textMuted}
        value={search}
        onChangeText={setSearch}
      />

      <View style={styles.tableHeader}>
        <Text style={[styles.colText, styles.colBib]}>Bib</Text>
        <Text style={[styles.colText, styles.colName]}>Nome</Text>
        <Text style={[styles.colText, styles.colCat]}>Categoria</Text>
        <Text style={[styles.colText, styles.colStatus]}>Status</Text>
      </View>

      {filtered.pairs.length === 0 && filtered.athletes.length === 0 && (
        <Text style={styles.empty}>
          {athletes.length === 0 && pairs.length === 0
            ? 'Nenhum atleta neste evento.'
            : 'Nenhum resultado na busca.'}
        </Text>
      )}

      {filtered.pairs.map(({ pair, name }) => (
        <View key={pair.id} style={styles.row}>
          <Text style={[styles.colText, styles.colBib, styles.bib]}>#{pair.bib}</Text>
          <View style={styles.colName}>
            <Text style={styles.name}>{name}</Text>
            {pair.totalMs != null && (
              <Text style={styles.time}>{formatMs(pair.totalMs)}</Text>
            )}
          </View>
          <Text style={[styles.colText, styles.colCat, styles.muted]} numberOfLines={2}>
            {selectedEvent
              ? `${getCategoryNameForAthlete(selectedEvent.categories, pair.categoryId)} (dupla)`
              : '—'}
          </Text>
          <View style={styles.colStatus}>
            <View
              style={[
                styles.statusBadge,
                pair.status === 'racing' && styles.racingBadge,
                pair.status === 'finished' && styles.finishedBadge,
              ]}>
              <Text style={styles.statusText}>{STATUS_LABELS[pair.status]}</Text>
            </View>
          </View>
        </View>
      ))}

      {filtered.athletes.map((athlete) => (
        <View key={athlete.id} style={styles.row}>
          <Text style={[styles.colText, styles.colBib, styles.bib]}>
            {athlete.bib > 0 ? `#${athlete.bib}` : '—'}
          </Text>
          <View style={styles.colName}>
            <Text style={styles.name}>{athlete.name}</Text>
            {athlete.totalMs != null && (
              <Text style={styles.time}>{formatMs(athlete.totalMs)}</Text>
            )}
          </View>
          <Text style={[styles.colText, styles.colCat, styles.muted]} numberOfLines={2}>
            {selectedEvent
              ? getCategoryNameForAthlete(selectedEvent.categories, athlete.categoryId)
              : '—'}
          </Text>
          <View style={styles.colStatus}>
            <View
              style={[
                styles.statusBadge,
                athlete.status === 'racing' && styles.racingBadge,
                athlete.status === 'finished' && styles.finishedBadge,
              ]}>
              <Text style={styles.statusText}>{STATUS_LABELS[athlete.status]}</Text>
            </View>
          </View>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { color: HyroxTheme.text, fontSize: 28, fontWeight: '800' },
  subheading: { color: HyroxTheme.textMuted, fontSize: 14, marginTop: 4, marginBottom: 12 },
  infoBanner: {
    backgroundColor: HyroxTheme.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
    padding: 12,
    marginBottom: 16,
  },
  infoText: { color: HyroxTheme.textMuted, fontSize: 13, lineHeight: 19 },
  label: { color: HyroxTheme.text, fontSize: 14, fontWeight: '600', marginBottom: 8 },
  eventRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  eventChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: HyroxTheme.surface,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
    maxWidth: '100%',
  },
  eventChipActive: { backgroundColor: HyroxTheme.accent, borderColor: HyroxTheme.accent },
  eventChipText: { color: HyroxTheme.textMuted, fontSize: 12, fontWeight: '600' },
  eventChipTextActive: { color: '#000' },
  addBtn: { marginBottom: 16 },
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
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: HyroxTheme.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: HyroxTheme.border,
  },
  colText: { color: HyroxTheme.textMuted, fontSize: 12, fontWeight: '600' },
  colBib: { width: 44 },
  colName: { flex: 1 },
  colCat: { width: 72 },
  colStatus: { width: 72, alignItems: 'flex-end' },
  bib: { color: HyroxTheme.accent, fontWeight: '800', fontSize: 14 },
  name: { color: HyroxTheme.text, fontSize: 15, fontWeight: '600' },
  time: { color: HyroxTheme.textMuted, fontSize: 12, marginTop: 2 },
  muted: { color: HyroxTheme.textMuted, fontSize: 11 },
  statusBadge: {
    backgroundColor: HyroxTheme.surfaceElevated,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  racingBadge: { backgroundColor: 'rgba(34, 197, 94, 0.2)' },
  finishedBadge: { backgroundColor: 'rgba(255, 237, 0, 0.15)' },
  statusText: { color: HyroxTheme.text, fontSize: 9, fontWeight: '600' },
  empty: { color: HyroxTheme.textMuted, textAlign: 'center', marginTop: 24 },
});
