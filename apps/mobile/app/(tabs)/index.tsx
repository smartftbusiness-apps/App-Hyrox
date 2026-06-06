import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { HyroxTheme } from '@/constants/Theme';
import { useAthletesStore } from '@/src/stores/athletesStore';
import { useEvents } from '@/src/stores/eventsStore';

const STATUS_COLORS: Record<string, string> = {
  draft: HyroxTheme.textMuted,
  open: HyroxTheme.warning,
  live: HyroxTheme.success,
  finished: HyroxTheme.textMuted,
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  open: 'Inscrições',
  live: 'Ao vivo',
  finished: 'Evento encerrado',
};

export default function EventsScreen() {
  const events = useEvents();
  const allAthletes = useAthletesStore((s) => s.athletes);

  const liveCount = events.filter((e) => e.status === 'live').length;
  const totalAthletes = allAthletes.length;

  return (
    <Screen scroll>
      <Text style={styles.heading}>Eventos</Text>
      <Text style={styles.subheading}>Gerencie competições Hyrox</Text>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{events.length}</Text>
          <Text style={styles.statLabel}>Eventos</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{totalAthletes}</Text>
          <Text style={styles.statLabel}>Atletas</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: HyroxTheme.success }]}>{liveCount}</Text>
          <Text style={styles.statLabel}>Ao vivo</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Próximos e ativos</Text>

      {events.map((event) => (
        <Card
          key={event.id}
          title={event.name}
          subtitle={`${event.location} · ${new Date(event.date).toLocaleDateString('pt-BR')}`}
          badge={STATUS_LABELS[event.status]}
          badgeColor={STATUS_COLORS[event.status] + '33'}
          onPress={() => router.push(`/event/${event.id}`)}>
          <View style={styles.cardFooter}>
            <Text style={styles.footerText}>
              {allAthletes.filter((a) => a.eventId === event.id).length} atletas
            </Text>
            <Text style={styles.footerText}>{event.categories.length} categorias</Text>
          </View>
        </Card>
      ))}

      <Card
        title="+ Novo evento"
        subtitle="Criar competição com template Hyrox (16 segmentos)"
        onPress={() => router.push('/event/new')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: {
    color: HyroxTheme.text,
    fontSize: 28,
    fontWeight: '800',
  },
  subheading: {
    color: HyroxTheme.textMuted,
    fontSize: 15,
    marginTop: 4,
    marginBottom: 20,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  stat: {
    flex: 1,
    backgroundColor: HyroxTheme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
    padding: 14,
    alignItems: 'center',
  },
  statValue: {
    color: HyroxTheme.accent,
    fontSize: 22,
    fontWeight: '800',
  },
  statLabel: {
    color: HyroxTheme.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  sectionTitle: {
    color: HyroxTheme.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: HyroxTheme.border,
  },
  footerText: {
    color: HyroxTheme.textMuted,
    fontSize: 13,
  },
});
