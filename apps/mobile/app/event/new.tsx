import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { HyroxTheme } from '@/constants/Theme';
import {
  DEFAULT_EVENT_PRESET_KEYS,
  EVENT_CATEGORY_PRESETS,
} from '@/src/domain/categoryPresets';
import type { EventStatus } from '@/src/domain/types';
import { useEventsStore } from '@/src/stores/eventsStore';

const STATUS_OPTIONS: { value: EventStatus; label: string }[] = [
  { value: 'draft', label: 'Rascunho' },
  { value: 'open', label: 'Inscrições abertas' },
  { value: 'live', label: 'Ao vivo' },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

export default function NewEventScreen() {
  const addEvent = useEventsStore((s) => s.addEvent);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState(todayIso());
  const [status, setStatus] = useState<EventStatus>('draft');
  const [selectedCategoryKeys, setSelectedCategoryKeys] = useState<string[]>([
    ...DEFAULT_EVENT_PRESET_KEYS,
  ]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  function toggleCategory(key: string) {
    setSelectedCategoryKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Informe o nome do evento';
    if (!location.trim()) next.location = 'Informe o local';
    if (!isValidDate(date)) next.date = 'Use o formato AAAA-MM-DD';
    if (selectedCategoryKeys.length === 0) {
      next.categories = 'Selecione pelo menos uma categoria';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      const event = addEvent({
        name,
        location,
        date,
        status,
        categoryPresetKeys: selectedCategoryKeys,
      });
      router.replace(`/event/${event.id}`);
    } catch {
      Alert.alert('Erro', 'Não foi possível criar o evento. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Novo evento',
          headerStyle: { backgroundColor: HyroxTheme.surface },
          headerTintColor: HyroxTheme.text,
        }}
      />
      <Screen scroll>
        <Text style={styles.heading}>Criar competição</Text>
        <Text style={styles.subheading}>
          Defina o evento e as categorias de participação
        </Text>

        <Input
          label="Nome do evento *"
          placeholder="Ex: Hyrox São Paulo 2026"
          value={name}
          onChangeText={setName}
          error={errors.name}
          autoFocus
        />
        <Input
          label="Local *"
          placeholder="Ex: Expo Center Norte"
          value={location}
          onChangeText={setLocation}
          error={errors.location}
        />
        <Input
          label="Data *"
          placeholder="AAAA-MM-DD"
          value={date}
          onChangeText={setDate}
          error={errors.date}
        />

        <Text style={styles.label}>Status inicial</Text>
        <View style={styles.statusRow}>
          {STATUS_OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              style={[styles.statusChip, status === opt.value && styles.statusChipActive]}
              onPress={() => setStatus(opt.value)}>
              <Text style={[styles.statusChipText, status === opt.value && styles.statusChipTextActive]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Categorias do evento *</Text>
        <Text style={styles.hint}>
          Toque para incluir ou remover. Duplas exigem categoria Doubles selecionada aqui.
        </Text>
        <View style={styles.categoryGrid}>
          {EVENT_CATEGORY_PRESETS.map((preset) => {
            const active = selectedCategoryKeys.includes(preset.key);
            return (
              <Pressable
                key={preset.key}
                style={[styles.categoryChip, active && styles.categoryChipActive]}
                onPress={() => toggleCategory(preset.key)}>
                <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>
                  {preset.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {errors.categories && <Text style={styles.errorText}>{errors.categories}</Text>}

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Incluído automaticamente</Text>
          <Text style={styles.infoText}>· Percurso Hyrox com 16 segmentos</Text>
          <Text style={styles.infoText}>
            · Categorias podem ser alteradas depois em Categorias → Gerenciar
          </Text>
        </View>

        <Button
          label={saving ? 'Salvando...' : 'Criar evento'}
          onPress={handleSave}
          large
          disabled={saving}
          style={styles.saveBtn}
        />
        <Button label="Cancelar" variant="secondary" onPress={() => router.back()} />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  heading: {
    color: HyroxTheme.text,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 4,
  },
  subheading: {
    color: HyroxTheme.textMuted,
    fontSize: 14,
    marginBottom: 24,
  },
  label: {
    color: HyroxTheme.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  hint: {
    color: HyroxTheme.textMuted,
    fontSize: 12,
    marginBottom: 10,
    lineHeight: 18,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  statusChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: HyroxTheme.surface,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
  },
  statusChipActive: {
    backgroundColor: HyroxTheme.accent,
    borderColor: HyroxTheme.accent,
  },
  statusChipText: {
    color: HyroxTheme.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  statusChipTextActive: {
    color: '#000',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: HyroxTheme.surface,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
  },
  categoryChipActive: {
    backgroundColor: HyroxTheme.accent,
    borderColor: HyroxTheme.accent,
  },
  categoryChipText: {
    color: HyroxTheme.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  categoryChipTextActive: {
    color: '#000',
  },
  errorText: {
    color: HyroxTheme.danger,
    fontSize: 12,
    marginBottom: 12,
  },
  infoBox: {
    backgroundColor: HyroxTheme.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
    padding: 14,
    marginBottom: 24,
    marginTop: 8,
  },
  infoTitle: {
    color: HyroxTheme.accent,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  infoText: {
    color: HyroxTheme.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  saveBtn: {
    marginBottom: 10,
  },
});
