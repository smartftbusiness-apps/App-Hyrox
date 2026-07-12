import { router, Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchRunsAtJudgeStation } from '@/src/api/liveTimingRepository';
import { syncJudgeEventLive } from '@/src/api/syncService';
import { fetchStaffForEvent } from '@/src/api/staffRepository';
import { isSupabaseConfigured } from '@/src/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EventNotFound } from '@/components/EventNotFound';
import { Screen } from '@/components/ui/Screen';
import { HyroxTheme } from '@/constants/Theme';
import { useAthletesByEvent, usePairsByEvent } from '@/src/stores/athletesStore';
import { getDoublesCategories } from '@/src/utils/categoryHelpers';
import {
  assignedParticipantsForHeat,
  buildTimingParticipants,
  groupEventParticipants,
} from '@/src/utils/participantHelpers';
import { useEvent } from '@/src/hooks/useEvent';
import { useEventPermissions } from '@/src/hooks/useEventPermissions';
import { useRouteId } from '@/src/hooks/useRouteId';
import { useEventsStore } from '@/src/stores/eventsStore';
import { useEventStaffStore, type EventStaffMember } from '@/src/stores/eventStaffStore';
import { genderLabel, getCategoryDisplayName } from '@/src/utils/categoryLabel';
import { confirmAsync } from '@/src/utils/confirm';
import { getEventFinishReadiness, getFinishEventBlockReason } from '@/src/utils/eventFinish';
import { navigateToEventsHome } from '@/src/utils/navigation';
import { formatMs } from '@/src/utils/formatTime';
import { stationLabel, isParticipantApproachingStation, isParticipantAtStation } from '@/src/utils/stationTiming';
import { getTotalMs, isSegmentRunning, participantKey, type TimingRunState } from '@/src/utils/timingRun';

const EMPTY_STAFF: EventStaffMember[] = [];

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
  const staff =
    useEventStaffStore((s) => (id ? s.staffByEvent[id] : undefined)) ?? EMPTY_STAFF;

  const loadStaff = useCallback(async () => {
    if (!event?.supabaseId || !id) return;
    const rows = await fetchStaffForEvent(event.supabaseId);
    useEventStaffStore.getState().setStaffForEvent(id, rows);
  }, [event?.supabaseId, id]);

  useEffect(() => {
    void loadStaff();
  }, [loadStaff]);

  const isJudgeViewEarly = !!event && perms.isJudgeMode && perms.isAssignedJudge;
  const judgeStationOrder = useEventStaffStore((s) =>
    id ? s.judgeStationByEvent[id] : undefined,
  );
  const [stationRuns, setStationRuns] = useState<TimingRunState[]>([]);
  const [stationNow, setStationNow] = useState(Date.now());

  useEffect(() => {
    if (!isJudgeViewEarly || !id || judgeStationOrder == null || !isSupabaseConfigured()) {
      setStationRuns([]);
      return;
    }

    const syncStation = async () => {
      await syncJudgeEventLive(id);
      const runs = await fetchRunsAtJudgeStation(id, judgeStationOrder);
      setStationRuns(runs);
    };

    void syncStation();
    const interval = setInterval(() => void syncStation(), 2000);
    return () => clearInterval(interval);
  }, [isJudgeViewEarly, id, judgeStationOrder]);

  useEffect(() => {
    if (!isJudgeViewEarly) return;
    const tick = setInterval(() => setStationNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [isJudgeViewEarly]);

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
  const heats = event.heats ?? [];
  const timingParticipants = buildTimingParticipants(athletes, pairs, eventCategories);
  const canEdit = perms.canEditStructure;
  const canEditParticipants = canEdit;
  const isJudgeView = perms.isJudgeMode && perms.isAssignedJudge;
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

        {isJudgeView && !isFinished && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                Na sua estação — {judgeStationOrder != null ? stationLabel(event.segments, judgeStationOrder) : '…'} ({stationRuns.length})
              </Text>
            </View>
            {judgeStationOrder == null ? (
              <Text style={styles.moreText}>
                Estação não definida. Peça ao organizador para designar sua estação em Juízes.
              </Text>
            ) : stationRuns.length === 0 ? (
              <Text style={styles.moreText}>
                Nenhum atleta a caminho ou nesta estação. Aguarde o organizador iniciar a bateria.
              </Text>
            ) : (
              stationRuns.map((run) => {
                const approaching =
                  judgeStationOrder != null &&
                  isParticipantApproachingStation(run, event.segments, judgeStationOrder);
                const atStation =
                  judgeStationOrder != null &&
                  isParticipantAtStation(run, event.segments, judgeStationOrder);
                const statusLabel = approaching
                  ? 'A caminho'
                  : atStation
                    ? isSegmentRunning(run)
                      ? 'No WOD'
                      : 'Aguardando início'
                    : 'Em prova';
                return (
                  <Card
                    key={participantKey(run.participant)}
                    title={`#${run.participant.bib} ${run.participant.label}`}
                    subtitle={`${statusLabel} · Tempo total: ${formatMs(getTotalMs(run, stationNow))}`}
                    badge="Na estação"
                  />
                );
              })
            )}
            <Button
              label="Abrir cronômetro da estação"
              variant="primary"
              onPress={() => router.push('/(tabs)/timing')}
              style={{ marginBottom: 16 }}
            />
          </>
        )}

        {!isJudgeView && (
          <>
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
                        badge={
                          p.status === 'racing'
                            ? 'Em prova'
                            : p.status === 'finished'
                              ? 'Finalizado'
                              : undefined
                        }
                      />
                    ) : (
                      <Card
                        key={p.id}
                        title={p.bib > 0 ? `#${p.bib} ${p.name}` : p.name}
                        subtitle={p.bib > 0 ? 'Individual' : 'Aguardando dupla'}
                        badge={
                          p.status === 'racing'
                            ? 'Em prova'
                            : p.status === 'finished'
                              ? 'Finalizado'
                              : undefined
                        }
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
          </>
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

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Baterias ({heats.length})</Text>
          {canEdit && (
            <Button
              label="Gerenciar"
              variant="secondary"
              onPress={() => router.push(`/event/${eventId}/heats`)}
              style={styles.manageBtn}
            />
          )}
        </View>
        {heats.length === 0 ? (
          <Text style={styles.moreText}>
            {canEdit
              ? 'Nenhuma bateria criada. Use Gerenciar para organizar as largadas.'
              : 'Nenhuma bateria definida.'}
          </Text>
        ) : (
          heats.map((heat) => {
            const assigned = assignedParticipantsForHeat(timingParticipants, heat);
            const timeLabel = new Date(heat.scheduledStartAt).toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            });
            return (
              <Pressable
                key={heat.id}
                style={({ pressed }) => [styles.listRow, pressed && styles.listRowPressed]}
                onPress={() =>
                  router.push(`/event/${eventId}/heats?heatId=${encodeURIComponent(heat.id)}`)
                }>
                <View style={styles.listRowBody}>
                  <Text style={styles.listRowTitle}>
                    {heat.name} · {timeLabel}
                    {heat.startedAt ? ' · iniciada' : ''}
                  </Text>
                  {assigned.length === 0 ? (
                    <Text style={styles.listRowMeta}>— Nenhum atleta vinculado</Text>
                  ) : (
                    assigned.map((p) => (
                      <Text key={`${p.type}-${p.id}`} style={styles.listRowMeta}>
                        · #{p.bib} {p.label}
                      </Text>
                    ))
                  )}
                </View>
                <Text style={styles.listChevron}>›</Text>
              </Pressable>
            );
          })
        )}

        {!isJudgeView && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Juízes ({staff.length})</Text>
              {perms.canManageJudges && (
                <Button
                  label="Cadastrar"
                  variant="secondary"
                  onPress={() => router.push(`/event/${eventId}/judges`)}
                  style={styles.manageBtn}
                />
              )}
            </View>
            {staff.length === 0 ? (
              <Text style={styles.moreText}>
                {perms.canManageJudges
                  ? 'Nenhum juiz cadastrado. Toque em Cadastrar para adicionar.'
                  : 'Nenhum juiz designado para este evento.'}
              </Text>
            ) : (
              staff.map((member) => (
                <Pressable
                  key={member.id}
                  style={({ pressed }) => [styles.listRow, pressed && styles.listRowPressed]}
                  onPress={() => router.push(`/event/${eventId}/judges`)}>
                  <View style={styles.listRowBody}>
                    <Text style={styles.listRowTitle}>{member.fullName || 'Juiz'}</Text>
                    <Text style={styles.listRowMeta}>
                      · {member.email || `ID ${member.userId.slice(0, 8)}…`}
                    </Text>
                  </View>
                  <Text style={styles.listChevron}>›</Text>
                </Pressable>
              ))
            )}
          </>
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
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    paddingLeft: 14,
    borderLeftWidth: 2,
    borderLeftColor: HyroxTheme.accent,
    backgroundColor: HyroxTheme.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
  },
  listRowPressed: { opacity: 0.85 },
  listRowBody: { flex: 1 },
  listRowTitle: {
    color: HyroxTheme.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  listRowMeta: {
    color: HyroxTheme.textMuted,
    fontSize: 13,
    lineHeight: 20,
    paddingLeft: 4,
  },
  listChevron: {
    color: HyroxTheme.textMuted,
    fontSize: 22,
    fontWeight: '300',
  },
});
