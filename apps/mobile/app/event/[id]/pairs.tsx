import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { EventNotFound } from '@/components/EventNotFound';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { HyroxTheme } from '@/constants/Theme';
import { useEvent } from '@/src/hooks/useEvent';
import { useEventPermissions } from '@/src/hooks/useEventPermissions';
import { useAthletesByEvent, useAthletesStore, usePairsByEvent } from '@/src/stores/athletesStore';
import { getDoublesCategories } from '@/src/utils/categoryHelpers';
import { genderLabel, getCategoryDisplayName } from '@/src/utils/categoryLabel';
import { getPairDisplayName, getUnpairedAthletes, groupPairsByDoublesCategory } from '@/src/utils/pairHelpers';

export default function EventPairsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const event = useEvent(id);
  const athletes = useAthletesByEvent(id);
  const pairs = usePairsByEvent(id);
  const perms = useEventPermissions(event);

  const createPair = useAthletesStore((s) => s.createPair);
  const addDoublesTeam = useAthletesStore((s) => s.addDoublesTeam);
  const removePair = useAthletesStore((s) => s.removePair);
  const dissolvePair = useAthletesStore((s) => s.dissolvePair);
  const updatePairCategory = useAthletesStore((s) => s.updatePairCategory);
  const getNextBib = useAthletesStore((s) => s.getNextBib);

  const doublesCategories = useMemo(
    () => (event ? getDoublesCategories(event.categories) : []),
    [event],
  );

  const [mode, setMode] = useState<'quick' | 'from'>('quick');
  const [categoryId, setCategoryId] = useState(doublesCategories[0]?.id ?? '');
  const [bib, setBib] = useState('');
  const [name1, setName1] = useState('');
  const [name2, setName2] = useState('');
  const [teamName, setTeamName] = useState('');
  const [athlete1Id, setAthlete1Id] = useState('');
  const [athlete2Id, setAthlete2Id] = useState('');
  const [editingPairId, setEditingPairId] = useState<string | null>(null);
  const [editPairCategoryId, setEditPairCategoryId] = useState('');

  const canEdit = perms.canEditStructure;
  const effectiveCategoryId = categoryId || doublesCategories[0]?.id || '';

  const unpaired = useMemo(
    () => getUnpairedAthletes(athletes, effectiveCategoryId),
    [athletes, effectiveCategoryId],
  );

  const groupedPairs = useMemo(
    () => (event ? groupPairsByDoublesCategory(pairs, athletes, event.categories) : []),
    [event, pairs, athletes],
  );

  const eventId = event?.id ?? id ?? '';

  useEffect(() => {
    if (eventId && canEdit) {
      setBib(String(getNextBib(eventId)));
    }
  }, [eventId, canEdit, getNextBib]);

  if (!event) return <EventNotFound />;

  if (doublesCategories.length === 0) {
    return (
      <>
        <Stack.Screen options={{ title: 'Duplas' }} />
        <Screen>
          <Text style={styles.heading}>Duplas</Text>
          <Text style={styles.empty}>
            Este evento não tem categorias Doubles. Adicione em Categorias → Gerenciar.
          </Text>
        </Screen>
      </>
    );
  }

  function ensureBib(): number | null {
    const n = Number(bib);
    if (!bib.trim() || Number.isNaN(n) || n <= 0) {
      Alert.alert('Bib inválido', 'Informe o número de peito da dupla.');
      return null;
    }
    return n;
  }

  function goBackToEvent() {
    router.replace(`/event/${eventId}`);
  }

  function handleQuickAdd() {
    const b = ensureBib();
    if (b == null) return;
    const result = addDoublesTeam(eventId, {
      categoryId: effectiveCategoryId,
      bib: b,
      name1,
      name2,
      teamName: teamName.trim() || undefined,
    });
    if (!result.ok) {
      Alert.alert('Não foi possível', result.reason);
      return;
    }
    goBackToEvent();
  }

  function handleCreateFromExisting() {
    const b = ensureBib();
    if (b == null) return;
    if (!athlete1Id || !athlete2Id) {
      Alert.alert('Selecione dois atletas', 'Escolha os dois inscritos para formar a dupla.');
      return;
    }
    const result = createPair(eventId, {
      categoryId: effectiveCategoryId,
      athlete1Id,
      athlete2Id,
      bib: b,
      teamName: teamName.trim() || undefined,
    });
    if (!result.ok) {
      Alert.alert('Não foi possível', result.reason);
      return;
    }
    goBackToEvent();
  }

  function handleDissolve(pairId: string, label: string) {
    Alert.alert('Desfazer dupla', `Desfazer "${label}"? Os atletas ficam sem parceiro.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desfazer',
        onPress: () => {
          const result = dissolvePair(eventId, pairId);
          if (!result.ok) Alert.alert('Não foi possível', result.reason);
        },
      },
    ]);
  }

  function startEditPairCategory(pairId: string) {
    const pair = pairs.find((p) => p.id === pairId);
    if (!pair) return;
    setEditingPairId(pairId);
    setEditPairCategoryId(pair.categoryId);
  }

  function handleSavePairCategory() {
    if (!editingPairId) return;
    const result = updatePairCategory(eventId, editingPairId, editPairCategoryId);
    if (!result.ok) {
      Alert.alert('Não foi possível', result.reason);
      return;
    }
    setEditingPairId(null);
  }

  function handleRemove(pairId: string, label: string) {
    Alert.alert('Remover dupla', `Remover "${label}" e os dois atletas?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: () => {
          const result = removePair(eventId, pairId);
          if (!result.ok) Alert.alert('Não foi possível', result.reason);
        },
      },
    ]);
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Duplas' }} />
      <Screen scroll>
        <Text style={styles.heading}>Duplas</Text>
        <Text style={styles.subheading}>
          Cadastre duplas completas ou junte atletas já inscritos
        </Text>

        <Text style={styles.label}>Categoria Doubles</Text>
        <View style={styles.chipRow}>
          {doublesCategories.map((cat) => (
            <Pressable
              key={cat.id}
              style={[styles.chip, effectiveCategoryId === cat.id && styles.chipActive]}
              onPress={() => {
                setCategoryId(cat.id);
                setAthlete1Id('');
                setAthlete2Id('');
              }}>
              <Text style={[styles.chipText, effectiveCategoryId === cat.id && styles.chipTextActive]}>
                {getCategoryDisplayName(cat)} · {genderLabel(cat.gender)}
              </Text>
            </Pressable>
          ))}
        </View>

        {canEdit && (
          <View style={styles.form}>
            <View style={styles.modeRow}>
              <Pressable
                style={[styles.modeBtn, mode === 'quick' && styles.modeBtnActive]}
                onPress={() => setMode('quick')}>
                <Text style={[styles.modeText, mode === 'quick' && styles.modeTextActive]}>
                  Nova dupla
                </Text>
              </Pressable>
              <Pressable
                style={[styles.modeBtn, mode === 'from' && styles.modeBtnActive]}
                onPress={() => setMode('from')}>
                <Text style={[styles.modeText, mode === 'from' && styles.modeTextActive]}>
                  Juntar inscritos
                </Text>
              </Pressable>
            </View>

            <Input
              label="Bib da dupla *"
              placeholder={String(getNextBib(eventId))}
              value={bib}
              onChangeText={setBib}
              keyboardType="number-pad"
            />
            <Input
              label="Nome da equipe (opcional)"
              placeholder="Ex: Team RX"
              value={teamName}
              onChangeText={setTeamName}
            />

            {mode === 'quick' ? (
              <>
                <Input label="Atleta 1 *" value={name1} onChangeText={setName1} />
                <Input label="Atleta 2 *" value={name2} onChangeText={setName2} />
                <Button label="Salvar dupla" onPress={handleQuickAdd} />
              </>
            ) : (
              <>
                <Text style={styles.hint}>
                  Sem parceiro ({unpaired.length}): selecione dois atletas
                </Text>
                {unpaired.map((a) => (
                  <Pressable
                    key={a.id}
                    style={[
                      styles.pickRow,
                      (athlete1Id === a.id || athlete2Id === a.id) && styles.pickRowActive,
                    ]}
                    onPress={() => {
                      if (athlete1Id === a.id) setAthlete1Id('');
                      else if (athlete2Id === a.id) setAthlete2Id('');
                      else if (!athlete1Id) setAthlete1Id(a.id);
                      else if (!athlete2Id) setAthlete2Id(a.id);
                      else {
                        setAthlete1Id(a.id);
                        setAthlete2Id('');
                      }
                    }}>
                    <Text style={styles.pickName}>{a.name}</Text>
                    <Text style={styles.pickMeta}>
                      {athlete1Id === a.id ? 'Atleta 1' : athlete2Id === a.id ? 'Atleta 2' : 'Toque para selecionar'}
                    </Text>
                  </Pressable>
                ))}
                {unpaired.length < 2 && (
                  <Text style={styles.hint}>
                    Inscreva pelo menos 2 atletas nesta categoria em Atletas → Gerenciar.
                  </Text>
                )}
                <Button
                  label="Formar dupla"
                  onPress={handleCreateFromExisting}
                  disabled={!athlete1Id || !athlete2Id}
                  style={{ marginTop: 12 }}
                />
              </>
            )}
          </View>
        )}

        {editingPairId && (
          <View style={styles.editBox}>
            <Text style={styles.formTitle}>Alterar categoria da dupla</Text>
            <View style={styles.chipRow}>
              {doublesCategories.map((cat) => (
                <Pressable
                  key={cat.id}
                  style={[styles.chip, editPairCategoryId === cat.id && styles.chipActive]}
                  onPress={() => setEditPairCategoryId(cat.id)}>
                  <Text style={[styles.chipText, editPairCategoryId === cat.id && styles.chipTextActive]}>
                    {getCategoryDisplayName(cat)} · {genderLabel(cat.gender)}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.editActions}>
              <Button label="Salvar" onPress={handleSavePairCategory} style={styles.editBtn} />
              <Button
                label="Cancelar"
                variant="secondary"
                onPress={() => setEditingPairId(null)}
                style={styles.editBtn}
              />
            </View>
          </View>
        )}

        <Text style={styles.listTitle}>Duplas formadas</Text>
        {groupedPairs.length === 0 && (
          <Text style={styles.empty}>Nenhuma dupla neste evento ainda.</Text>
        )}
        {groupedPairs.map(({ category, pairs: catPairs }) => (
          <View key={category.id} style={styles.group}>
            <Text style={styles.groupTitle}>
              {getCategoryDisplayName(category)} · {genderLabel(category.gender)}
            </Text>
            {catPairs.map(({ pair, label }) => (
              <View key={pair.id} style={styles.pairRow}>
                <Text style={styles.pairBib}>#{pair.bib}</Text>
                <View style={styles.pairInfo}>
                  <Text style={styles.pairName}>{label}</Text>
                  <Text style={styles.pairMeta}>
                    {athletes.find((a) => a.id === pair.athlete1Id)?.name} ·{' '}
                    {athletes.find((a) => a.id === pair.athlete2Id)?.name}
                  </Text>
                </View>
                {canEdit && (
                  <View style={styles.pairActions}>
                    <Pressable onPress={() => startEditPairCategory(pair.id)}>
                      <Text style={styles.editLink}>Editar</Text>
                    </Pressable>
                    <Pressable onPress={() => handleDissolve(pair.id, label)}>
                      <Text style={styles.link}>Desfazer</Text>
                    </Pressable>
                    <Pressable onPress={() => handleRemove(pair.id, label)}>
                      <Text style={styles.remove}>Remover</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ))}
          </View>
        ))}

        {unpaired.length > 0 && (
          <View style={styles.group}>
            <Text style={styles.groupTitle}>Aguardando parceiro — {effectiveCategoryId && doublesCategories.find(c => c.id === effectiveCategoryId)?.name}</Text>
            {unpaired.map((a) => (
              <View key={a.id} style={styles.unpairedRow}>
                <Text style={styles.pickName}>{a.name}</Text>
              </View>
            ))}
          </View>
        )}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  heading: { color: HyroxTheme.text, fontSize: 22, fontWeight: '800' },
  subheading: { color: HyroxTheme.textMuted, fontSize: 14, marginBottom: 16 },
  label: { color: HyroxTheme.text, fontSize: 14, fontWeight: '600', marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: HyroxTheme.surface,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
  },
  chipActive: { backgroundColor: HyroxTheme.accent, borderColor: HyroxTheme.accent },
  chipText: { color: HyroxTheme.textMuted, fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: '#000' },
  form: {
    backgroundColor: HyroxTheme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
    padding: 16,
    marginBottom: 24,
  },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: HyroxTheme.surfaceElevated,
    alignItems: 'center',
  },
  modeBtnActive: { backgroundColor: HyroxTheme.accent },
  modeText: { color: HyroxTheme.textMuted, fontSize: 12, fontWeight: '600' },
  modeTextActive: { color: '#000' },
  hint: { color: HyroxTheme.textMuted, fontSize: 12, marginBottom: 8 },
  pickRow: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
    marginBottom: 6,
  },
  pickRowActive: { borderColor: HyroxTheme.accent, backgroundColor: 'rgba(255,237,0,0.1)' },
  pickName: { color: HyroxTheme.text, fontWeight: '600' },
  pickMeta: { color: HyroxTheme.textMuted, fontSize: 11, marginTop: 2 },
  listTitle: { color: HyroxTheme.text, fontSize: 16, fontWeight: '700', marginBottom: 12 },
  empty: { color: HyroxTheme.textMuted, textAlign: 'center', marginVertical: 16 },
  group: { marginBottom: 20 },
  groupTitle: { color: HyroxTheme.accent, fontSize: 14, fontWeight: '700', marginBottom: 8 },
  pairRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: HyroxTheme.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
    padding: 12,
    marginBottom: 6,
    gap: 10,
  },
  pairBib: { color: HyroxTheme.accent, fontWeight: '800', width: 44 },
  pairInfo: { flex: 1 },
  pairName: { color: HyroxTheme.text, fontSize: 15, fontWeight: '700' },
  pairMeta: { color: HyroxTheme.textMuted, fontSize: 11, marginTop: 2 },
  pairActions: { alignItems: 'flex-end', gap: 4 },
  editBox: {
    backgroundColor: HyroxTheme.surfaceElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: HyroxTheme.accent,
    padding: 16,
    marginBottom: 16,
  },
  formTitle: { color: HyroxTheme.accent, fontSize: 15, fontWeight: '700', marginBottom: 12 },
  editActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  editBtn: { flex: 1 },
  editLink: { color: HyroxTheme.accent, fontSize: 11, fontWeight: '600' },
  link: { color: HyroxTheme.textMuted, fontSize: 11 },
  remove: { color: HyroxTheme.danger, fontSize: 11, fontWeight: '600' },
  unpairedRow: {
    padding: 10,
    backgroundColor: HyroxTheme.surfaceElevated,
    borderRadius: 8,
    marginBottom: 4,
  },
});
