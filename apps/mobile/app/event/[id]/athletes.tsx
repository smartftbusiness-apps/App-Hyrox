import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { EventNotFound } from '@/components/EventNotFound';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { HyroxTheme } from '@/constants/Theme';
import { useEvent } from '@/src/hooks/useEvent';
import { useEventPermissions } from '@/src/hooks/useEventPermissions';
import { useAthletesByEvent, useAthletesStore, usePairsByEvent } from '@/src/stores/athletesStore';
import { getCategoryNameForAthlete, groupAthletesByCategory } from '@/src/utils/athleteHelpers';
import { getDoublesCategories, isDoublesCategory } from '@/src/utils/categoryHelpers';
import { genderLabel, getCategoryDisplayName } from '@/src/utils/categoryLabel';
import {
  getPairMemberNames,
  getUnpairedAthletes,
  groupPairsByDoublesCategory,
} from '@/src/utils/pairHelpers';

const STATUS_LABELS: Record<string, string> = {
  registered: 'Inscrito',
  checked_in: 'Check-in',
  racing: 'Em prova',
  finished: 'Finalizado',
  dnf: 'DNF',
  dns: 'DNS',
};

export default function EventAthletesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const event = useEvent(id);
  const athletes = useAthletesByEvent(id);
  const pairs = usePairsByEvent(id);
  const perms = useEventPermissions(event);
  const addAthlete = useAthletesStore((s) => s.addAthlete);
  const removeAthlete = useAthletesStore((s) => s.removeAthlete);
  const updateAthleteName = useAthletesStore((s) => s.updateAthleteName);
  const updateAthleteBib = useAthletesStore((s) => s.updateAthleteBib);
  const updateAthleteCategory = useAthletesStore((s) => s.updateAthleteCategory);
  const updatePairTeamName = useAthletesStore((s) => s.updatePairTeamName);
  const updatePairBib = useAthletesStore((s) => s.updatePairBib);
  const updatePairCategory = useAthletesStore((s) => s.updatePairCategory);
  const getNextBib = useAthletesStore((s) => s.getNextBib);

  const canEdit = perms.canEditStructure;

  const [name, setName] = useState('');
  const [bib, setBib] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [editingAthleteId, setEditingAthleteId] = useState<string | null>(null);
  const [editingPairId, setEditingPairId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editBib, setEditBib] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editTeamName, setEditTeamName] = useState('');
  const [editMember1Name, setEditMember1Name] = useState('');
  const [editMember2Name, setEditMember2Name] = useState('');

  useEffect(() => {
    if (event && !categoryId && event.categories.length > 0) {
      setCategoryId(event.categories[0].id);
    }
  }, [event, categoryId]);

  useEffect(() => {
    if (event && canEdit) {
      setBib(String(getNextBib(event.id)));
    }
  }, [event?.id, canEdit, getNextBib]);

  if (!event) {
    return <EventNotFound />;
  }

  const eventId = event.id;
  const eventCategories = event.categories;
  const grouped = groupAthletesByCategory(athletes, eventCategories);
  const doublesCategories = getDoublesCategories(event.categories);
  const groupedPairs = groupPairsByDoublesCategory(pairs, athletes, event.categories);

  const selectedCat = event.categories.find((c) => c.id === categoryId);
  const isDoubles = selectedCat ? isDoublesCategory(selectedCat) : false;

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Informe o nome';
    if (!isDoubles && (!bib.trim() || Number.isNaN(Number(bib)))) next.bib = 'Bib inválido';
    if (!categoryId) next.categoryId = 'Selecione uma categoria';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleAdd() {
    if (!validate()) return;
    const result = addAthlete(eventId, {
      name,
      bib: isDoubles ? 0 : Number(bib),
      categoryId,
    });
    if (!result.ok) {
      Alert.alert('Não foi possível', result.reason);
      return;
    }
    setName('');
    setBib(String(getNextBib(eventId)));
    setErrors({});
  }

  function startEditAthlete(athleteId: string) {
    const athlete = athletes.find((a) => a.id === athleteId);
    if (!athlete) return;
    setEditingPairId(null);
    setEditingAthleteId(athleteId);
    setEditName(athlete.name);
    setEditBib(athlete.bib > 0 ? String(athlete.bib) : '');
    setEditCategoryId(athlete.categoryId);
  }

  function startEditPair(pairId: string) {
    const pair = pairs.find((p) => p.id === pairId);
    if (!pair) return;
    const a1 = athletes.find((a) => a.id === pair.athlete1Id);
    const a2 = athletes.find((a) => a.id === pair.athlete2Id);
    setEditingAthleteId(null);
    setEditingPairId(pairId);
    setEditTeamName(pair.teamName ?? '');
    setEditBib(String(pair.bib));
    setEditMember1Name(a1?.name ?? '');
    setEditMember2Name(a2?.name ?? '');
    setEditCategoryId(pair.categoryId);
  }

  function cancelEdit() {
    setEditingAthleteId(null);
    setEditingPairId(null);
  }

  function handleSaveAthleteEdit() {
    if (!editingAthleteId) return;
    const athlete = athletes.find((a) => a.id === editingAthleteId);
    if (!athlete) return;

    const nameResult = updateAthleteName(eventId, editingAthleteId, editName);
    if (!nameResult.ok) {
      Alert.alert('Não foi possível', nameResult.reason);
      return;
    }

    if (!athlete.pairId && editCategoryId !== athlete.categoryId) {
      const catResult = updateAthleteCategory(eventId, editingAthleteId, editCategoryId);
      if (!catResult.ok) {
        Alert.alert('Não foi possível', catResult.reason);
        return;
      }
    }

    const editCat = eventCategories.find((c) => c.id === editCategoryId);
    const isDoublesAthlete = editCat ? isDoublesCategory(editCat) : false;
    if (!athlete.pairId && !isDoublesAthlete && editBib.trim()) {
      const bibResult = updateAthleteBib(eventId, editingAthleteId, Number(editBib));
      if (!bibResult.ok) {
        Alert.alert('Não foi possível', bibResult.reason);
        return;
      }
    }

    cancelEdit();
  }

  function handleSavePairEdit() {
    if (!editingPairId) return;
    const pair = pairs.find((p) => p.id === editingPairId);
    if (!pair) return;

    if (editCategoryId !== pair.categoryId) {
      const catResult = updatePairCategory(eventId, editingPairId, editCategoryId);
      if (!catResult.ok) {
        Alert.alert('Não foi possível', catResult.reason);
        return;
      }
    }

    const teamResult = updatePairTeamName(eventId, editingPairId, editTeamName);
    if (!teamResult.ok) {
      Alert.alert('Não foi possível', teamResult.reason);
      return;
    }
    const bibResult = updatePairBib(eventId, editingPairId, Number(editBib));
    if (!bibResult.ok) {
      Alert.alert('Não foi possível', bibResult.reason);
      return;
    }
    const n1 = updateAthleteName(eventId, pair.athlete1Id, editMember1Name);
    if (!n1.ok) {
      Alert.alert('Não foi possível', n1.reason);
      return;
    }
    const n2 = updateAthleteName(eventId, pair.athlete2Id, editMember2Name);
    if (!n2.ok) {
      Alert.alert('Não foi possível', n2.reason);
      return;
    }
    cancelEdit();
  }

  function handleRemove(athleteId: string, athleteName: string) {
    Alert.alert('Remover atleta', `Remover "${athleteName}" do evento?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: () => {
          const result = removeAthlete(eventId, athleteId);
          if (!result.ok) Alert.alert('Não foi possível', result.reason);
        },
      },
    ]);
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Atletas' }} />
      <Screen scroll>
        <Text style={styles.heading}>Atletas inscritos</Text>
        <Text style={styles.subheading}>{event.name} · {athletes.length} atletas</Text>

        {!canEdit && (
          <View style={styles.readonlyBanner}>
            <Text style={styles.readonlyText}>
              {event.status === 'finished'
                ? 'Evento encerrado — edição bloqueada.'
                : 'Somente quem criou o evento pode inscrever atletas.'}
            </Text>
          </View>
        )}

        {canEdit && event.categories.length === 0 && (
          <View style={styles.readonlyBanner}>
            <Text style={styles.readonlyText}>
              Cadastre categorias no evento antes de inscrever atletas.
            </Text>
            <Button
              label="Ir para categorias →"
              variant="secondary"
              onPress={() => router.push(`/event/${eventId}/categories`)}
              style={{ marginTop: 12 }}
            />
          </View>
        )}

        {canEdit && event.categories.length > 0 && (
          <View style={styles.form}>
            <Text style={styles.formTitle}>Novo atleta</Text>
            <Input
              label="Nome *"
              placeholder="Nome completo"
              value={name}
              onChangeText={setName}
              error={errors.name}
            />
            {!isDoubles && (
              <Input
                label="Número de peito (bib) *"
                placeholder="101"
                value={bib}
                onChangeText={setBib}
                keyboardType="number-pad"
                error={errors.bib}
              />
            )}
            {isDoubles && (
              <>
                <Text style={styles.doublesHint}>
                  Inscreva cada atleta para juntar depois, ou cadastre a dupla completa de uma vez.
                </Text>
                <Button
                  label="Cadastrar dupla completa →"
                  onPress={() => router.push(`/event/${eventId}/pairs`)}
                  style={{ marginBottom: 12 }}
                />
              </>
            )}
            <Text style={styles.label}>Categoria *</Text>
            <View style={styles.categoryRow}>
              {event.categories.map((cat) => (
                <Pressable
                  key={cat.id}
                  style={[styles.catChip, categoryId === cat.id && styles.catChipActive]}
                  onPress={() => setCategoryId(cat.id)}>
                  <Text
                    style={[
                      styles.catChipText,
                      categoryId === cat.id && styles.catChipTextActive,
                    ]}>
                    {getCategoryDisplayName(cat)}
                    {isDoublesCategory(cat) ? ` · ${genderLabel(cat.gender)}` : ''}
                  </Text>
                </Pressable>
              ))}
            </View>
            {errors.categoryId && <Text style={styles.errorText}>{errors.categoryId}</Text>}
            <Button label="Adicionar atleta" onPress={handleAdd} style={{ marginTop: 8 }} />
            {event.categories.some(isDoublesCategory) && (
              <Button
                label="Montar duplas →"
                variant="secondary"
                onPress={() => router.push(`/event/${eventId}/pairs`)}
                style={{ marginTop: 10 }}
              />
            )}
          </View>
        )}

        {editingAthleteId && (
          <View style={styles.editBox}>
            <Text style={styles.formTitle}>Editar atleta</Text>
            <Input label="Nome *" value={editName} onChangeText={setEditName} />
            {(() => {
              const athlete = athletes.find((a) => a.id === editingAthleteId);
              const editCat = event.categories.find((c) => c.id === editCategoryId);
              const inPair = Boolean(athlete?.pairId);
              const isDoubles = editCat ? isDoublesCategory(editCat) : false;
              return (
                <>
                  {!inPair && !isDoubles && (
                    <Input
                      label="Bib *"
                      value={editBib}
                      onChangeText={setEditBib}
                      keyboardType="number-pad"
                    />
                  )}
                  {!inPair && (
                    <>
                      <Text style={styles.label}>Categoria</Text>
                      <View style={styles.categoryRow}>
                        {event.categories.map((cat) => (
                          <Pressable
                            key={cat.id}
                            style={[
                              styles.catChip,
                              editCategoryId === cat.id && styles.catChipActive,
                            ]}
                            onPress={() => setEditCategoryId(cat.id)}>
                            <Text
                              style={[
                                styles.catChipText,
                                editCategoryId === cat.id && styles.catChipTextActive,
                              ]}>
                              {getCategoryDisplayName(cat)}
                    {isDoublesCategory(cat) ? ` · ${genderLabel(cat.gender)}` : ''}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </>
                  )}
                  {inPair && (
                    <Text style={styles.doublesHint}>
                      Em dupla: só o nome pode ser editado aqui. Bib e categoria são da dupla.
                    </Text>
                  )}
                </>
              );
            })()}
            <View style={styles.editActions}>
              <Button label="Salvar" onPress={handleSaveAthleteEdit} style={styles.editBtn} />
              <Button label="Cancelar" variant="secondary" onPress={cancelEdit} style={styles.editBtn} />
            </View>
          </View>
        )}

        {editingPairId && (
          <View style={styles.editBox}>
            <Text style={styles.formTitle}>Editar dupla</Text>
            <Input
              label="Nome da equipe (opcional)"
              value={editTeamName}
              onChangeText={setEditTeamName}
              placeholder="Ex: Team RX"
            />
            <Text style={styles.label}>Categoria Doubles *</Text>
            <View style={styles.categoryRow}>
              {doublesCategories.map((cat) => (
                <Pressable
                  key={cat.id}
                  style={[styles.catChip, editCategoryId === cat.id && styles.catChipActive]}
                  onPress={() => setEditCategoryId(cat.id)}>
                  <Text
                    style={[
                      styles.catChipText,
                      editCategoryId === cat.id && styles.catChipTextActive,
                    ]}>
                    {getCategoryDisplayName(cat)} · {genderLabel(cat.gender)}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Input
              label="Bib da dupla *"
              value={editBib}
              onChangeText={setEditBib}
              keyboardType="number-pad"
            />
            <Input
              label="Atleta 1 *"
              value={editMember1Name}
              onChangeText={setEditMember1Name}
            />
            <Input
              label="Atleta 2 *"
              value={editMember2Name}
              onChangeText={setEditMember2Name}
            />
            <View style={styles.editActions}>
              <Button label="Salvar" onPress={handleSavePairEdit} style={styles.editBtn} />
              <Button label="Cancelar" variant="secondary" onPress={cancelEdit} style={styles.editBtn} />
            </View>
          </View>
        )}

        {athletes.length === 0 && (
          <Text style={styles.empty}>Nenhum atleta inscrito ainda.</Text>
        )}

        {grouped.map(({ category, athletes: catAthletes }) => (
          <View key={category.id} style={styles.group}>
            <Text style={styles.groupTitle}>
              {getCategoryDisplayName(category)} ({catAthletes.length})
            </Text>
            {catAthletes.map((athlete) => (
              <View key={athlete.id} style={styles.row}>
                <Text style={styles.bib}>#{athlete.bib}</Text>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowName}>{athlete.name}</Text>
                  <Text style={styles.rowMeta}>{STATUS_LABELS[athlete.status]}</Text>
                </View>
                {canEdit && (
                  <View style={styles.rowActions}>
                    <Pressable onPress={() => startEditAthlete(athlete.id)}>
                      <Text style={styles.edit}>Editar</Text>
                    </Pressable>
                    <Pressable onPress={() => handleRemove(athlete.id, athlete.name)}>
                      <Text style={styles.remove}>Remover</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ))}
          </View>
        ))}

        {doublesCategories.map((category) => {
          const unpaired = getUnpairedAthletes(athletes, category.id);
          const catPairs = groupedPairs.find((g) => g.category.id === category.id)?.pairs ?? [];
          if (unpaired.length === 0 && catPairs.length === 0) return null;
          return (
            <View key={`doubles-${category.id}`} style={styles.group}>
              <Text style={styles.groupTitle}>
                {getCategoryDisplayName(category)} · {genderLabel(category.gender)} — Duplas ({catPairs.length}) · Sem par ({unpaired.length})
              </Text>
              {catPairs.map(({ pair, label }) => (
                <View key={pair.id} style={styles.row}>
                  <Text style={styles.bib}>#{pair.bib}</Text>
                  <View style={styles.rowInfo}>
                    <Text style={styles.rowName}>{label}</Text>
                    <Text style={styles.rowMeta}>
                      {getPairMemberNames(pair, athletes).join(' · ')} · {STATUS_LABELS[pair.status]}
                    </Text>
                  </View>
                  {canEdit && (
                    <Pressable onPress={() => startEditPair(pair.id)}>
                      <Text style={styles.edit}>Editar</Text>
                    </Pressable>
                  )}
                </View>
              ))}
              {unpaired.map((athlete) => (
                <View key={athlete.id} style={[styles.row, styles.unpairedRow]}>
                  <Text style={styles.bib}>—</Text>
                  <View style={styles.rowInfo}>
                    <Text style={styles.rowName}>{athlete.name}</Text>
                    <Text style={styles.rowMeta}>Aguardando dupla</Text>
                  </View>
                  {canEdit && (
                    <View style={styles.rowActions}>
                      <Pressable onPress={() => startEditAthlete(athlete.id)}>
                        <Text style={styles.edit}>Editar</Text>
                      </Pressable>
                      <Pressable onPress={() => handleRemove(athlete.id, athlete.name)}>
                        <Text style={styles.remove}>Remover</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              ))}
            </View>
          );
        })}

        {athletes.some(
          (a) => !event.categories.some((c) => c.id === a.categoryId),
        ) && (
          <View style={styles.group}>
            <Text style={styles.groupTitle}>Sem categoria válida</Text>
            {athletes
              .filter((a) => !event.categories.some((c) => c.id === a.categoryId))
              .map((athlete) => (
                <View key={athlete.id} style={styles.row}>
                  <Text style={styles.bib}>#{athlete.bib}</Text>
                  <View style={styles.rowInfo}>
                    <Text style={styles.rowName}>{athlete.name}</Text>
                    <Text style={styles.rowMeta}>
                      {getCategoryNameForAthlete(event.categories, athlete.categoryId)}
                    </Text>
                  </View>
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
  label: { color: HyroxTheme.text, fontSize: 14, fontWeight: '600', marginBottom: 8 },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: HyroxTheme.surfaceElevated,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
  },
  catChipActive: { backgroundColor: HyroxTheme.accent, borderColor: HyroxTheme.accent },
  catChipText: { color: HyroxTheme.textMuted, fontSize: 12, fontWeight: '600' },
  catChipTextActive: { color: '#000' },
  errorText: { color: HyroxTheme.danger, fontSize: 12, marginBottom: 8 },
  empty: { color: HyroxTheme.textMuted, textAlign: 'center', marginVertical: 24 },
  group: { marginBottom: 20 },
  groupTitle: {
    color: HyroxTheme.accent,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  row: {
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
  bib: { color: HyroxTheme.accent, fontWeight: '800', fontSize: 14, width: 44 },
  rowInfo: { flex: 1 },
  rowName: { color: HyroxTheme.text, fontSize: 15, fontWeight: '600' },
  rowMeta: { color: HyroxTheme.textMuted, fontSize: 12, marginTop: 2 },
  rowActions: { alignItems: 'flex-end', gap: 6 },
  edit: { color: HyroxTheme.accent, fontSize: 12, fontWeight: '600' },
  remove: { color: HyroxTheme.danger, fontSize: 12, fontWeight: '600' },
  editBox: {
    backgroundColor: HyroxTheme.surfaceElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: HyroxTheme.accent,
    padding: 16,
    marginBottom: 20,
  },
  editActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  editBtn: { flex: 1 },
  doublesHint: {
    color: HyroxTheme.textMuted,
    fontSize: 12,
    marginBottom: 12,
    lineHeight: 18,
  },
  unpairedRow: { borderStyle: 'dashed' },
});
