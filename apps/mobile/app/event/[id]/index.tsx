import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EventNotFound } from '@/components/EventNotFound';
import { Screen } from '@/components/ui/Screen';
import { HyroxTheme } from '@/constants/Theme';
import { useAthletesByEvent, usePairsByEvent } from '@/src/stores/athletesStore';
import { getDoublesCategories } from '@/src/utils/categoryHelpers';
import { groupEventParticipants } from '@/src/utils/participantHelpers';
import { useEvent } from '@/src/hooks/useEvent';
import { useEventPermissions } from '@/src/hooks/useEventPermissions';
import { useRouteId } from '@/src/hooks/useRouteId';
import { useEventsStore } from '@/src/stores/eventsStore';
import { genderLabel, getCategoryDisplayName } from '@/src/utils/categoryLabel';
import { confirmAsync } from '@/src/utils/confirm';
import { getEventFinishReadiness, getFinishEventBlockReason } from '@/src/utils/eventFinish';
import { navigateToEventsHome } from '@/src/utils/navigation';

export default function EventDetailScreen() {
  const id = useRouteId();
  const event = useEvent(id);
  const perms = useEventPermissions(event);
  const updateEventStatus = useEventsStore((s) => s.updateEventStatus);
  const finishEvent = useEventsStore((s) => s.finishEvent);
  const deleteEvent = useEventsStore((s) => s.deleteEvent);
  const [finishing, setFinishing] = useState(false);
  const athletes = useAthletesByEvent(id);
  const pairs = usePairsByEvent(id);
  const doublesCategories = event ? getDoublesCategories(event.categories) : [];

  if (!event) {
    return (
      <>
        <Stack.Screen options={{ title: 'Evento' }} />
        <EventNotFound />
      </>
    );
  }

  const eventId = event.id;
  const eventCategories = event.categories;
  const isFinished = event.status === 'finished';
  const participantGroups = groupEventParticipants(athletes, pairs, eventCategories);
  const finishReadiness = getEventFinishReadiness(athletes, pairs);
  const totalParticipants = finishReadiness.totalParticipants;
  const racing =
    athletes.filter((a) => !a.pairId && a.status === 'racing').length +
    pairs.filter((p) => p.status === 'racing').length;
  const finished = finishReadiness.finishedCount;
  const stationCount = event.segments.filter((s) => s.type === 'station').length;
  const canEdit = perms.canEditStructure;
  const canEditParticipants = canEdit;
  const finishBlockReason = getFinishEventBlockReason(finishReadiness);

  function handleAddPair() {
    if (doublesCategories.length === 0) {
      Alert.alert(
        'Duplas não disponíveis',
        'Este evento não tem categoria Doubles. Edite as categorias do evento para incluir Doubles.',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Editar categorias',
            onPress: () => router.push(`/event/${eventId}/categories`),
          },
        ],
      );
      return;
    }
    router.push(`/event/${eventId}/pairs`);
  }

  function handleStatusChange(status: 'open' | 'live') {
    const result = updateEventStatus(eventId, status);
    if (!result.ok) Alert.alert('Não foi possível', result.reason);
  }

  async function handleFinish() {
    if (finishBlockReason) {
      Alert.alert('Não é possível encerrar', finishBlockReason);
      return;
    }

    const confirmed = await confirmAsync(
      'Encerrar evento',
      'O evento será marcado como encerrado. Depois disso ninguém poderá editar.',
      'Encerrar',
    );
    if (!confirmed) return;

    setFinishing(true);
    try {
      const result = await finishEvent(eventId);
      if (!result.ok) {
        Alert.alert('Não foi possível', result.reason);
        return;
      }

      navigateToEventsHome();

      if (result.warning) {
        setTimeout(() => Alert.alert('Evento encerrado', result.warning), 400);
      }
    } finally {
      setFinishing(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: event.name }} />
      <Screen scroll>
        <View style={styles.statusBanner}>
          {event.status === 'live' && <View style={styles.liveDot} />}
          <Text
            style={[
              styles.statusText,
              event.status === 'live' && { color: HyroxTheme.success },
              event.status === 'finished' && { color: HyroxTheme.textMuted },
              event.status === 'open' && { color: HyroxTheme.warning },
            ]}>
            {event.status === 'live'
              ? 'Ao vivo'
              : event.status === 'open'
                ? 'Inscrições abertas'
                : event.status === 'draft'
                  ? 'Rascunho'
                  : 'Evento encerrado'}
          </Text>
        </View>

        <Text style={styles.meta}>
          {event.location} ·{' '}
          {new Date(event.date).toLocaleDateString('pt-BR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </Text>

        {isFinished && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>Este evento está encerrado. Edição bloqueada.</Text>
          </View>
        )}

        {canEdit && (
          <View style={styles.actionsBox}>
            <Text style={styles.actionsTitle}>Ações do organizador</Text>
            <View style={styles.actionsRow}>
              {event.status !== 'live' && (
                <Button
                  label="Colocar ao vivo"
                  onPress={() => handleStatusChange('live')}
                  style={styles.actionBtn}
                />
              )}
              {event.status !== 'open' && event.status !== 'live' && (
                <Button
                  label="Abrir inscrições"
                  variant="secondary"
                  onPress={() => handleStatusChange('open')}
                  style={styles.actionBtn}
                />
              )}
            </View>
            <Button
              label={finishing ? 'Encerrando…' : 'Encerrar evento'}
              variant="danger"
              disabled={finishing}
              onPress={handleFinish}
            />
            {finishBlockReason ? (
              <Text style={styles.finishHint}>{finishBlockReason}</Text>
            ) : totalParticipants === 0 ? (
              <Text style={styles.finishHintOk}>Sem participantes — pode encerrar quando quiser.</Text>
            ) : (
              <Text style={styles.finishHintOk}>
                Todos os participantes finalizados — pronto para encerrar.
              </Text>
            )}
          </View>
        )}

        {perms.isReadOnly && !isFinished && (
          <View style={[styles.banner, styles.bannerMuted]}>
            <Text style={styles.bannerText}>
              {perms.isAssignedJudge
                ? 'Modo juiz: visualização e cronômetro. Edição restrita ao organizador.'
                : 'Somente o organizador pode editar este evento.'}
            </Text>
          </View>
        )}

        {perms.canControlTiming && !isFinished && (
          <Button
            label="Abrir cronômetro"
            variant="primary"
            onPress={() => router.push('/(tabs)/timing')}
            style={{ marginBottom: 16 }}
          />
        )}

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{athletes.length}</Text>
            <Text style={styles.statLabel}>Inscritos</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: HyroxTheme.success }]}>{racing}</Text>
            <Text style={styles.statLabel}>Em prova</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{finished}</Text>
            <Text style={styles.statLabel}>Finalizados</Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Participantes ({totalParticipants})
          </Text>
        </View>

        {canEditParticipants && (
          <View style={styles.participantActions}>
            <Button
              label="+ Atleta"
              onPress={() => router.push(`/event/${event.id}/athletes`)}
              style={styles.participantActionBtn}
            />
            {doublesCategories.length > 0 && (
              <Button
                label="+ Dupla"
                variant="secondary"
                onPress={handleAddPair}
                style={styles.participantActionBtn}
              />
            )}
          </View>
        )}

        {!canEditParticipants && totalParticipants > 0 && (
          <Button
            label="Ver participantes"
            variant="secondary"
            onPress={() => router.push(`/event/${event.id}/athletes`)}
            style={{ marginBottom: 12 }}
          />
        )}

        {totalParticipants === 0 ? (
          <Text style={styles.moreText}>
            {event.categories.length === 0
              ? 'Cadastre categorias antes de inscrever participantes.'
              : 'Nenhum participante inscrito. Use + Atleta (individual) ou + Dupla.'}
          </Text>
        ) : (
          participantGroups.map(({ category, participants }) => (
            <View key={category.id} style={styles.participantGroup}>
              <Text style={styles.participantCatTitle}>
                {getCategoryDisplayName(category)} · {genderLabel(category.gender)}
              </Text>
              {participants.map((p) =>
                p.kind === 'pair' ? (
                  <Card
                    key={p.id}
                    title={`#${p.bib} ${p.label}`}
                    subtitle={`Dupla · ${p.memberNames.join(' + ')}`}
                    badge={p.status === 'racing' ? 'Em prova' : p.status === 'finished' ? 'Finalizado' : undefined}
                  />
                ) : (
                  <Card
                    key={p.id}
                    title={p.bib > 0 ? `#${p.bib} ${p.name}` : p.name}
                    subtitle={p.bib > 0 ? 'Individual' : 'Aguardando dupla'}
                    badge={p.status === 'racing' ? 'Em prova' : p.status === 'finished' ? 'Finalizado' : undefined}
                  />
                ),
              )}
            </View>
          ))
        )}
        {totalParticipants > 0 && canEditParticipants && (
          <View style={styles.participantActions}>
            <Button
              label="Gerenciar atletas"
              variant="secondary"
              onPress={() => router.push(`/event/${event.id}/athletes`)}
              style={styles.participantActionBtn}
            />
            {doublesCategories.length > 0 && (
              <Button
                label="Gerenciar duplas"
                variant="secondary"
                onPress={handleAddPair}
                style={styles.participantActionBtn}
              />
            )}
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Categorias ({event.categories.length})</Text>
          {canEdit && (
            <Button
              label="Gerenciar"
              variant="secondary"
              onPress={() => router.push(`/event/${event.id}/categories`)}
              style={styles.manageBtn}
            />
          )}
        </View>
        {event.categories.slice(0, 3).map((cat) => (
          <Card
            key={cat.id}
            title={getCategoryDisplayName(cat)}
            subtitle={`${cat.division} · ${genderLabel(cat.gender)}`}
          />
        ))}
        {event.categories.length > 3 && (
          <Text style={styles.moreText}>+{event.categories.length - 3} categorias</Text>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Estações ({event.segments.length} seg. · {stationCount} WODs)
          </Text>
          {canEdit && (
            <Button
              label="Gerenciar"
              variant="secondary"
              onPress={() => router.push(`/event/${event.id}/stations`)}
              style={styles.manageBtn}
            />
          )}
        </View>
        {event.segments.slice(0, 5).map((seg) => (
          <View key={seg.id} style={styles.segmentRow}>
            <Text style={styles.segmentOrder}>{seg.order}</Text>
            <View style={styles.segmentInfo}>
              <Text style={styles.segmentName}>{seg.name}</Text>
              <Text style={styles.segmentTarget}>{seg.target}</Text>
            </View>
            <View style={[styles.typePill, seg.type === 'run' ? styles.runPill : styles.stationPill]}>
              <Text style={styles.typePillText}>{seg.type === 'run' ? 'Run' : 'WOD'}</Text>
            </View>
          </View>
        ))}
        {event.segments.length > 5 && canEdit && (
          <Text style={styles.moreText}>Ver todos em Gerenciar →</Text>
        )}

        {canEdit && (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Baterias ({(event.heats ?? []).length})</Text>
            <Button
              label="Gerenciar"
              variant="secondary"
              onPress={() => router.push(`/event/${eventId}/heats`)}
              style={styles.manageBtn}
            />
          </View>
        )}

        {canEdit && (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Juízes</Text>
            <Button
              label="Designar"
              variant="secondary"
              onPress={() => router.push(`/event/${eventId}/judges`)}
              style={styles.manageBtn}
            />
          </View>
        )}

        {perms.canDeleteEvent && (
          <Button
            label="Excluir evento"
            variant="danger"
            onPress={async () => {
              const confirmed = await confirmAsync(
                'Excluir evento',
                'Esta ação não pode ser desfeita. Todos os dados do evento serão removidos.',
                'Excluir',
              );
              if (!confirmed) return;
              const result = await deleteEvent(eventId);
              if (!result.ok) Alert.alert('Erro', result.reason);
              else navigateToEventsHome();
            }}
            style={{ marginTop: 24 }}
          />
        )}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  statusBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: HyroxTheme.success },
  statusText: { fontWeight: '700', fontSize: 14, color: HyroxTheme.textMuted },
  meta: { color: HyroxTheme.textMuted, fontSize: 14, marginBottom: 16 },
  banner: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  bannerMuted: {
    backgroundColor: HyroxTheme.surface,
    borderColor: HyroxTheme.border,
  },
  bannerText: { color: HyroxTheme.text, fontSize: 13 },
  finishHint: { color: HyroxTheme.textMuted, fontSize: 12, marginTop: 10, lineHeight: 18 },
  finishHintOk: { color: HyroxTheme.success, fontSize: 12, marginTop: 10, lineHeight: 18 },
  actionsBox: {
    backgroundColor: HyroxTheme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
    padding: 16,
    marginBottom: 20,
  },
  actionsTitle: { color: HyroxTheme.accent, fontWeight: '700', marginBottom: 12 },
  actionsRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  actionBtn: { flex: 1 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  stat: {
    flex: 1,
    backgroundColor: HyroxTheme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
    padding: 14,
    alignItems: 'center',
  },
  statValue: { color: HyroxTheme.accent, fontSize: 22, fontWeight: '800' },
  statLabel: { color: HyroxTheme.textMuted, fontSize: 11, marginTop: 4 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    marginTop: 8,
    gap: 8,
  },
  sectionTitle: { color: HyroxTheme.text, fontSize: 16, fontWeight: '700', flex: 1 },
  manageBtn: { paddingVertical: 8, paddingHorizontal: 12 },
  moreText: { color: HyroxTheme.textMuted, fontSize: 13, marginBottom: 16 },
  participantGroup: { marginBottom: 12 },
  participantCatTitle: {
    color: HyroxTheme.accent,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  participantActions: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  participantActionBtn: { flex: 1 },
  hintBox: {
    backgroundColor: HyroxTheme.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
    padding: 12,
    marginBottom: 12,
  },
  hintText: { color: HyroxTheme.textMuted, fontSize: 13, lineHeight: 19 },
  segmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: HyroxTheme.border,
    gap: 12,
  },
  segmentOrder: { color: HyroxTheme.textMuted, fontSize: 14, fontWeight: '700', width: 24 },
  segmentInfo: { flex: 1 },
  segmentName: { color: HyroxTheme.text, fontSize: 14, fontWeight: '600' },
  segmentTarget: { color: HyroxTheme.textMuted, fontSize: 12 },
  typePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  runPill: { backgroundColor: 'rgba(59, 130, 246, 0.2)' },
  stationPill: { backgroundColor: 'rgba(249, 115, 22, 0.2)' },
  typePillText: { color: HyroxTheme.text, fontSize: 10, fontWeight: '700' },
});
