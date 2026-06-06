import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { ChipGroup } from '@/components/ui/ChipGroup';
import { EventNotFound } from '@/components/EventNotFound';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { HyroxTheme } from '@/constants/Theme';
import type { SegmentType } from '@/src/domain/types';
import { useEvent, useIsEventOwner } from '@/src/hooks/useEvent';
import { useEventsStore } from '@/src/stores/eventsStore';

const SEGMENT_TYPES: { value: SegmentType; label: string }[] = [
  { value: 'run', label: 'Corrida' },
  { value: 'station', label: 'Estação' },
];

export default function StationsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const event = useEvent(id);
  const isOwner = useIsEventOwner(event);
  const addSegment = useEventsStore((s) => s.addSegment);
  const removeSegment = useEventsStore((s) => s.removeSegment);
  const resetSegmentsToHyrox = useEventsStore((s) => s.resetSegmentsToHyrox);
  const canEdit = isOwner && event?.status !== 'finished';

  const [type, setType] = useState<SegmentType>('station');
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!event) {
    return <EventNotFound />;
  }

  const eventId = event.id;

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Informe o nome';
    if (!target.trim()) next.target = 'Informe distância ou reps';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleAdd() {
    if (!validate()) return;
    const result = addSegment(eventId, { type, name, target });
    if (!result.ok) {
      Alert.alert('Não foi possível', result.reason);
      return;
    }
    setName('');
    setTarget('');
    setErrors({});
  }

  function handleRemove(segmentId: string, segmentName: string) {
    Alert.alert('Remover segmento', `Remover "${segmentName}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: () => {
          const result = removeSegment(eventId, segmentId);
          if (!result.ok) Alert.alert('Não foi possível', result.reason);
        },
      },
    ]);
  }

  function handleReset() {
    Alert.alert(
      'Restaurar Hyrox',
      'Substituir todos os segmentos pelo template oficial (16 segmentos)?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Restaurar',
          onPress: () => {
            const result = resetSegmentsToHyrox(eventId);
            if (!result.ok) Alert.alert('Não foi possível', result.reason);
          },
        },
      ],
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Estações' }} />
      <Screen scroll>
        <Text style={styles.heading}>Percurso do evento</Text>
        <Text style={styles.subheading}>
          {event.segments.length} segmentos · ordem = sequência da prova
        </Text>

        {!canEdit && (
          <View style={styles.readonlyBanner}>
            <Text style={styles.readonlyText}>
              {event.status === 'finished'
                ? 'Evento encerrado — edição bloqueada.'
                : 'Somente quem criou o evento pode editar estações.'}
            </Text>
          </View>
        )}

        {canEdit && (
          <>
            <Button
              label="Restaurar template Hyrox (16 segmentos)"
              variant="secondary"
              onPress={handleReset}
              style={styles.resetBtn}
            />
            <View style={styles.form}>
              <Text style={styles.formTitle}>Novo segmento</Text>
              <ChipGroup label="Tipo" options={SEGMENT_TYPES} value={type} onChange={setType} />
              <Input
                label="Nome *"
                placeholder={type === 'run' ? 'Run 1' : 'SkiErg'}
                value={name}
                onChangeText={setName}
                error={errors.name}
              />
              <Input
                label="Meta *"
                placeholder={type === 'run' ? '1 km' : '1000 m ou 100 reps'}
                value={target}
                onChangeText={setTarget}
                error={errors.target}
              />
              <Button label="Adicionar ao final" onPress={handleAdd} />
            </View>
          </>
        )}

        <Text style={styles.listTitle}>Sequência da prova</Text>
        {event.segments.map((seg) => (
          <View key={seg.id} style={styles.row}>
            <Text style={styles.order}>{seg.order}</Text>
            <View style={styles.rowInfo}>
              <Text style={styles.rowName}>{seg.name}</Text>
              <Text style={styles.rowMeta}>
                {seg.type === 'run' ? 'Corrida' : 'Estação'} · {seg.target}
              </Text>
            </View>
            {canEdit && (
              <Pressable
                style={styles.removeBtn}
                onPress={() => handleRemove(seg.id, seg.name)}>
                <Text style={styles.removeText}>✕</Text>
              </Pressable>
            )}
          </View>
        ))}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  heading: { color: HyroxTheme.text, fontSize: 22, fontWeight: '800' },
  subheading: { color: HyroxTheme.textMuted, fontSize: 14, marginBottom: 16 },
  readonlyBanner: {
    backgroundColor: HyroxTheme.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
    padding: 12,
    marginBottom: 16,
  },
  readonlyText: { color: HyroxTheme.textMuted, fontSize: 13 },
  resetBtn: { marginBottom: 16 },
  form: {
    backgroundColor: HyroxTheme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
    padding: 16,
    marginBottom: 24,
  },
  formTitle: { color: HyroxTheme.accent, fontSize: 15, fontWeight: '700', marginBottom: 12 },
  listTitle: { color: HyroxTheme.text, fontSize: 16, fontWeight: '700', marginBottom: 12 },
  row: {
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
  order: {
    color: HyroxTheme.accent,
    fontSize: 16,
    fontWeight: '800',
    width: 28,
    textAlign: 'center',
  },
  rowInfo: { flex: 1 },
  rowName: { color: HyroxTheme.text, fontSize: 15, fontWeight: '600' },
  rowMeta: { color: HyroxTheme.textMuted, fontSize: 12, marginTop: 2 },
  removeBtn: { padding: 8 },
  removeText: { color: HyroxTheme.danger, fontSize: 16, fontWeight: '700' },
});
