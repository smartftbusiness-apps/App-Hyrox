import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EventNotFound } from '@/components/EventNotFound';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { HyroxTheme } from '@/constants/Theme';
import { useEvent } from '@/src/hooks/useEvent';
import { useEventPermissions } from '@/src/hooks/useEventPermissions';
import { useRouteId } from '@/src/hooks/useRouteId';
import { useAthletesByEvent, usePairsByEvent } from '@/src/stores/athletesStore';
import { useEventsStore } from '@/src/stores/eventsStore';
import {
  assignedParticipantsForHeat,
  buildTimingParticipants,
  findHeatWithParticipant,
} from '@/src/utils/participantHelpers';
import { participantKey } from '@/src/utils/timingRun';

export default function EventHeatsScreen() {
  const eventId = useRouteId();
  const event = useEvent(eventId);
  const perms = useEventPermissions(event);
  const athletes = useAthletesByEvent(eventId || undefined);
  const pairs = usePairsByEvent(eventId || undefined);
  const addHeat = useEventsStore((s) => s.addHeat);
  const updateHeat = useEventsStore((s) => s.updateHeat);
  const removeHeat = useEventsStore((s) => s.removeHeat);

  const [name, setName] = useState('');
  const [time, setTime] = useState('08:00');
  const { heatId: heatIdParam } = useLocalSearchParams<{ heatId?: string }>();
  const [expandedHeatId, setExpandedHeatId] = useState<string | null>(null);

  const participants = useMemo(() => {
    if (!event) return [];
    return buildTimingParticipants(athletes, pairs, event.categories);
  }, [athletes, pairs, event]);

  useEffect(() => {
    if (typeof heatIdParam === 'string' && heatIdParam) {
      setExpandedHeatId(heatIdParam);
    }
  }, [heatIdParam]);

  if (!event || !eventId) {
    return (
      <>
        <Stack.Screen options={{ title: 'Baterias' }} />
        <EventNotFound />
      </>
    );
  }

  const heats = event.heats ?? [];

  if (!perms.canEditStructure) {
    const focusHeatId = typeof heatIdParam === 'string' ? heatIdParam : null;
    return (
      <>
        <Stack.Screen options={{ title: 'Baterias' }} />
        <Screen scroll>
          <Text style={styles.heading}>Baterias</Text>
          <Text style={styles.subheading}>Detalhes das largadas e atletas vinculados.</Text>
          {heats.length === 0 ? (
            <Card title="Nenhuma bateria" subtitle="O organizador ainda não criou baterias." />
          ) : (
            heats.map((heat) => {
              const assigned = assignedParticipantsForHeat(participants, heat);
              const focused = focusHeatId === heat.id;
              return (
                <Card
                  key={heat.id}
                  title={heat.name}
                  subtitle={new Date(heat.scheduledStartAt).toLocaleString('pt-BR')}
                  badge={heat.startedAt ? 'Iniciada' : 'Aguardando'}
                  badgeColor={heat.startedAt ? HyroxTheme.success + '33' : HyroxTheme.warning + '33'}
                  style={focused ? styles.focusedCard : undefined}>
                  {assigned.length === 0 ? (
                    <Text style={styles.meta}>Nenhum atleta vinculado.</Text>
                  ) : (
                    <View style={styles.assignedList}>
                      {assigned.map((p) => (
                        <Text key={participantKey(p)} style={styles.assignedRow}>
                          · #{p.bib} {p.label}
                          {p.type === 'pair' ? ` (${p.memberNames.join(' + ')})` : ''}
                        </Text>
                      ))}
                    </View>
                  )}
                </Card>
              );
            })
          )}
        </Screen>
      </>
    );
  }

  const eid = eventId;
  const ev = event;

  function handleAdd() {
    if (!name.trim()) {
      Alert.alert('Nome', 'Informe o nome da bateria (ex: Bateria 1).');
      return;
    }
    const [h, m] = time.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) {
      Alert.alert('Horário', 'Use formato HH:MM (ex: 08:30).');
      return;
    }
    const eventDate = new Date(ev.date);
    eventDate.setHours(h, m, 0, 0);
    const result = addHeat(eid, {
      name: name.trim(),
      scheduledStartAt: eventDate.toISOString(),
    });
    if (!result.ok) Alert.alert('Erro', result.reason);
    else {
      setName('');
      Alert.alert('Bateria criada', 'Vincule os atletas com nome e número do peito.');
    }
  }

  function toggleParticipant(heatId: string, key: string) {
    const heat = heats.find((h) => h.id === heatId);
    if (!heat) return;
    const current = new Set(heat.participantKeys ?? []);
    if (current.has(key)) {
      current.delete(key);
    } else {
      const otherHeat = findHeatWithParticipant(heats, key, heatId);
      if (otherHeat) {
        const participant = participants.find((p) => participantKey(p) === key);
        const label = participant ? `#${participant.bib} ${participant.label}` : 'Este atleta';
        Alert.alert(
          'Já em outra bateria',
          `${label} já está na bateria "${otherHeat.name}". Remova de lá antes de vincular aqui.`,
        );
        return;
      }
      current.add(key);
    }
    const nextKeys = Array.from(current);
    const assigned = participants.filter((p) => nextKeys.includes(participantKey(p)));
    const result = updateHeat(eid, heatId, {
      participantKeys: nextKeys,
      bibNumbers: assigned.map((p) => p.bib),
    });
    if (!result.ok) Alert.alert('Erro', result.reason);
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Baterias' }} />
      <Screen scroll>
        <Text style={styles.heading}>Baterias de largada</Text>
        <Text style={styles.subheading}>
          Crie baterias e vincule atletas. O organizador inicia a bateria; todos seguem a ordem do
          percurso. Juízes cronometram cada estação.
        </Text>

        <Input label="Nome da bateria" value={name} onChangeText={setName} placeholder="Bateria 1" />
        <Input
          label="Horário planejado (HH:MM)"
          value={time}
          onChangeText={setTime}
          placeholder="08:00"
        />
        <Button label="Adicionar bateria" onPress={handleAdd} style={{ marginBottom: 24 }} />

        {heats.length === 0 ? (
          <Card title="Nenhuma bateria" subtitle="Crie baterias para organizar as largadas." />
        ) : (
          heats.map((heat) => {
            const assigned = assignedParticipantsForHeat(participants, heat);
            const isExpanded = expandedHeatId === heat.id;
            const focused = expandedHeatId === heat.id;
            return (
              <Card
                key={heat.id}
                title={heat.name}
                subtitle={new Date(heat.scheduledStartAt).toLocaleString('pt-BR')}
                badge={heat.startedAt ? 'Iniciada' : 'Aguardando'}
                badgeColor={heat.startedAt ? HyroxTheme.success + '33' : HyroxTheme.warning + '33'}
                style={focused ? styles.focusedCard : undefined}>
                {assigned.length === 0 ? (
                  <Text style={styles.meta}>Nenhum atleta vinculado.</Text>
                ) : (
                  <View style={styles.assignedList}>
                    {assigned.map((p) => (
                      <Text key={participantKey(p)} style={styles.assignedRow}>
                        #{p.bib} · {p.label}
                        {p.type === 'pair' ? ` (${p.memberNames.join(' + ')})` : ''}
                      </Text>
                    ))}
                  </View>
                )}

                <Button
                  label={isExpanded ? 'Fechar lista' : 'Vincular atletas'}
                  variant="secondary"
                  onPress={() => setExpandedHeatId(isExpanded ? null : heat.id)}
                  style={{ marginTop: 8 }}
                />

                {isExpanded && (
                  <View style={styles.picker}>
                    {participants.length === 0 ? (
                      <Text style={styles.meta}>Cadastre atletas antes de vincular.</Text>
                    ) : (
                      participants.map((p) => {
                        const key = participantKey(p);
                        const selected = (heat.participantKeys ?? []).includes(key);
                        const otherHeat = findHeatWithParticipant(heats, key, heat.id);
                        const blocked = !!otherHeat && !selected;
                        return (
                          <Pressable
                            key={key}
                            style={[
                              styles.pickerRow,
                              selected && styles.pickerRowSelected,
                              blocked && styles.pickerRowBlocked,
                            ]}
                            onPress={() => toggleParticipant(heat.id, key)}
                            disabled={blocked}>
                            <Text style={styles.pickerBib}>#{p.bib}</Text>
                            <View style={styles.pickerInfo}>
                              <Text style={styles.pickerName}>{p.label}</Text>
                              <Text style={styles.pickerMeta}>
                                {p.type === 'pair' ? 'Dupla' : 'Individual'} · {p.categoryName}
                                {blocked ? ` · em ${otherHeat?.name}` : ''}
                              </Text>
                            </View>
                            <Text style={styles.pickerCheck}>{selected ? '✓' : ''}</Text>
                          </Pressable>
                        );
                      })
                    )}
                  </View>
                )}

                <Button
                  label="Remover bateria"
                  variant="danger"
                  onPress={() => {
                    const r = removeHeat(eid, heat.id);
                    if (!r.ok) Alert.alert('Erro', r.reason);
                    else if (expandedHeatId === heat.id) setExpandedHeatId(null);
                  }}
                  style={{ marginTop: 8 }}
                />
              </Card>
            );
          })
        )}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  heading: { color: HyroxTheme.text, fontSize: 22, fontWeight: '800', marginBottom: 8 },
  subheading: { color: HyroxTheme.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 16 },
  meta: { color: HyroxTheme.textMuted, fontSize: 13, marginBottom: 4 },
  focusedCard: { borderColor: HyroxTheme.accent, borderWidth: 2 },
  assignedList: { marginBottom: 4, gap: 4 },
  assignedRow: { color: HyroxTheme.text, fontSize: 14, fontWeight: '600' },
  picker: { marginTop: 12, gap: 6 },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
    backgroundColor: HyroxTheme.surface,
  },
  pickerRowSelected: {
    borderColor: HyroxTheme.accent,
    backgroundColor: 'rgba(255, 237, 0, 0.08)',
  },
  pickerRowBlocked: { opacity: 0.45 },
  pickerBib: { color: HyroxTheme.accent, fontWeight: '800', fontSize: 14, minWidth: 44 },
  pickerInfo: { flex: 1 },
  pickerName: { color: HyroxTheme.text, fontSize: 15, fontWeight: '600' },
  pickerMeta: { color: HyroxTheme.textMuted, fontSize: 12, marginTop: 2 },
  pickerCheck: { color: HyroxTheme.accent, fontSize: 18, fontWeight: '800', width: 24, textAlign: 'center' },
});
