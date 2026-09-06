import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { ChipGroup } from '@/components/ui/ChipGroup';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { HyroxTheme } from '@/constants/Theme';
import type { Division, Gender } from '@/src/domain/types';
import { useEvent } from '@/src/hooks/useEvent';
import { useEventPermissions } from '@/src/hooks/useEventPermissions';
import { useEventsStore } from '@/src/stores/eventsStore';
import { EventNotFound } from '@/components/EventNotFound';
import { buildCategoryName, genderLabel, getCategoryDisplayName } from '@/src/utils/categoryLabel';
import { confirmAsync } from '@/src/utils/confirm';

const DIVISIONS: { value: Division; label: string }[] = [
  { value: 'Open', label: 'Open' },
  { value: 'Pro', label: 'Pro' },
  { value: 'Doubles', label: 'Doubles' },
  { value: 'Relay', label: 'Relay' },
];

const GENDERS: { value: Gender; label: string }[] = [
  { value: 'M', label: 'Masc' },
  { value: 'F', label: 'Fem' },
  { value: 'Mixed', label: 'Misto' },
];

export default function CategoriesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const event = useEvent(id);
  const perms = useEventPermissions(event);
  const addCategory = useEventsStore((s) => s.addCategory);
  const removeCategory = useEventsStore((s) => s.removeCategory);
  const canEdit = perms.canEditStructure;

  const [division, setDivision] = useState<Division>('Open');
  const [gender, setGender] = useState<Gender>('M');
  const [customName, setCustomName] = useState('');

  if (!event) {
    return <EventNotFound />;
  }

  const eventId = event.id;

  function handleAdd() {
    const result = addCategory(eventId, {
      division,
      gender,
      name: customName.trim() || undefined,
    });
    if (!result.ok) {
      Alert.alert('Não foi possível', result.reason);
      return;
    }
    setCustomName('');
  }

  async function handleRemove(categoryId: string, name: string) {
    const confirmed = await confirmAsync(
      'Remover categoria',
      `Remover "${name}"?`,
      'Remover',
    );
    if (!confirmed) return;

    const result = removeCategory(eventId, categoryId);
    if (!result.ok) {
      Alert.alert('Não foi possível', result.reason);
    }
  }

  const previewName = customName.trim() || buildCategoryName(division, gender);

  return (
    <>
      <Stack.Screen options={{ title: 'Categorias' }} />
      <Screen scroll>
        <Text style={styles.heading}>Categorias do evento</Text>
        <Text style={styles.subheading}>
          {event.name} — ajuste as categorias definidas na criação do evento
        </Text>

        {!canEdit && (
          <View style={styles.readonlyBanner}>
            <Text style={styles.readonlyText}>
              {event.status === 'finished'
                ? 'Evento encerrado — edição bloqueada.'
                : 'Somente quem criou o evento pode editar categorias.'}
            </Text>
          </View>
        )}

        {canEdit && <View style={styles.form}>
          <Text style={styles.formTitle}>Nova categoria</Text>
          <ChipGroup label="Divisão" options={DIVISIONS} value={division} onChange={setDivision} />
          <ChipGroup label="Gênero" options={GENDERS} value={gender} onChange={setGender} />
          <Input
            label="Nome personalizado (opcional)"
            placeholder={previewName}
            value={customName}
            onChangeText={setCustomName}
          />
          <Text style={styles.preview}>Será cadastrada como: {previewName}</Text>
          <Button label="Adicionar categoria" onPress={handleAdd} />
        </View>}

        <Text style={styles.listTitle}>Cadastradas ({event.categories.length})</Text>
        {event.categories.map((cat) => (
          <View key={cat.id} style={styles.row}>
            <View style={styles.rowInfo}>
              <Text style={styles.rowName}>{getCategoryDisplayName(cat)}</Text>
              <Text style={styles.rowMeta}>
                {cat.division} · {genderLabel(cat.gender)}
              </Text>
            </View>
            {canEdit && (
              <Pressable
                style={styles.removeBtn}
                onPress={() => handleRemove(cat.id, cat.name)}>
                <Text style={styles.removeText}>Remover</Text>
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
  subheading: { color: HyroxTheme.textMuted, fontSize: 14, marginBottom: 20 },
  readonlyBanner: {
    backgroundColor: HyroxTheme.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
    padding: 12,
    marginBottom: 16,
  },
  readonlyText: { color: HyroxTheme.textMuted, fontSize: 13 },
  form: {
    backgroundColor: HyroxTheme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
    padding: 16,
    marginBottom: 24,
  },
  formTitle: { color: HyroxTheme.accent, fontSize: 15, fontWeight: '700', marginBottom: 12 },
  preview: { color: HyroxTheme.textMuted, fontSize: 13, marginBottom: 16 },
  listTitle: { color: HyroxTheme.text, fontSize: 16, fontWeight: '700', marginBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: HyroxTheme.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
    padding: 14,
    marginBottom: 8,
  },
  rowInfo: { flex: 1 },
  rowName: { color: HyroxTheme.text, fontSize: 15, fontWeight: '600' },
  rowMeta: { color: HyroxTheme.textMuted, fontSize: 12, marginTop: 2 },
  removeBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  removeText: { color: HyroxTheme.danger, fontSize: 13, fontWeight: '600' },
});
