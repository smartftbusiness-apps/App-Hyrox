import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StationPicker } from '@/components/StationPicker';
import { EventNotFound } from '@/components/EventNotFound';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { HyroxTheme } from '@/constants/Theme';
import {
  assignExistingJudgeToEvent,
  clearEventStaffStation,
  fetchOrganizerJudges,
  fetchStaffForEvent,
  reactivateJudgeLogin,
  registerJudgeForEvent,
  registerOrganizerJudge,
  removeEventStaff,
  updateEventStaffStation,
  type OrganizerJudge,
} from '@/src/api/staffRepository';
import { pushEventToSupabase } from '@/src/api/syncService';
import { useEvent } from '@/src/hooks/useEvent';
import { useEventPermissions } from '@/src/hooks/useEventPermissions';
import { useRouteId } from '@/src/hooks/useRouteId';
import { isSupabaseConfigured } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/stores/authStore';
import { useEventStaffStore, type EventStaffMember } from '@/src/stores/eventStaffStore';
import { useEventsStore } from '@/src/stores/eventsStore';
import { stationLabel, stationSegmentOptions } from '@/src/utils/stationTiming';

const EMPTY_STAFF: EventStaffMember[] = [];
const EMPTY_ORGANIZER_JUDGES: OrganizerJudge[] = [];

export default function EventJudgesScreen() {
  const router = useRouter();
  const eventId = useRouteId();
  const event = useEvent(eventId);
  const perms = useEventPermissions(event);
  const authUser = useAuthStore((s) => s.user);
  const supabaseOn = isSupabaseConfigured();
  const resetSegmentsToHyrox = useEventsStore((s) => s.resetSegmentsToHyrox);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [organizerJudges, setOrganizerJudges] = useState<OrganizerJudge[]>(EMPTY_ORGANIZER_JUDGES);
  const staff =
    useEventStaffStore((s) => (eventId ? s.staffByEvent[eventId] : undefined)) ?? EMPTY_STAFF;

  useEffect(() => {
    if (!eventId || !event || !perms.canManageJudges) return;
    if (stationSegmentOptions(event.segments).length > 0) return;
    resetSegmentsToHyrox(eventId);
  }, [event, eventId, perms.canManageJudges, resetSegmentsToHyrox]);

  const loadStaff = useCallback(async () => {
    if (!eventId) return;
    setLoadError('');
    const currentEvent = useEventsStore.getState().events.find((e) => e.id === eventId);
    const cloudId = currentEvent?.supabaseId ?? event?.supabaseId;
    if (cloudId) {
      try {
        const rows = await fetchStaffForEvent(cloudId);
        useEventStaffStore.getState().setStaffForEvent(eventId, rows);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao carregar juízes do evento';
        setLoadError(message);
      }
    } else if (supabaseOn && authUser) {
      setLoadError('Evento ainda não está na nuvem. Aguarde a sincronização ou toque em cadastrar.');
    }
    if (perms.canManageJudges) {
      try {
        const judges = await fetchOrganizerJudges();
        setOrganizerJudges(judges);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao carregar juízes cadastrados';
        setLoadError((prev) => prev || message);
        setOrganizerJudges(EMPTY_ORGANIZER_JUDGES);
      }
    }
  }, [authUser, event?.supabaseId, eventId, perms.canManageJudges, supabaseOn]);

  useEffect(() => {
    if (!eventId || !perms.canManageJudges || !event) return;
    if (event.supabaseId) return;
    void pushEventToSupabase(eventId).then(() => loadStaff());
  }, [event?.supabaseId, eventId, perms.canManageJudges, event, loadStaff]);

  useEffect(() => {
    void loadStaff();
  }, [loadStaff]);

  if (!event || !eventId) {
    return (
      <>
        <Stack.Screen options={{ title: 'Juízes' }} />
        <EventNotFound />
      </>
    );
  }

  if (!perms.canManageJudges) {
    const needsLogin = supabaseOn && !authUser;
    return (
      <>
        <Stack.Screen options={{ title: 'Juízes' }} />
        <Screen scroll>
          <Text style={styles.heading}>Juízes do evento</Text>
          <Text style={styles.subheading}>
            Equipe com acesso ao cronômetro da estação designada.
          </Text>
          {needsLogin && (
            <Card
              title="Login necessário"
              subtitle="Para cadastrar juízes, entre com a conta de organizador na aba Conta."
              style={{ marginBottom: 16 }}>
              <Button label="Ir para login" onPress={() => router.push('/auth')} />
            </Card>
          )}
          {!needsLogin && !perms.isOwner && (
            <Text style={styles.hint}>
              Apenas o organizador logado pode designar juízes. Entre com a conta que criou o evento.
            </Text>
          )}
          {loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}
          {staff.length === 0 ? (
            <Card title="Nenhum juiz" subtitle="Nenhum juiz designado para este evento." />
          ) : (
            staff.map((member) => (
              <Card
                key={member.id}
                title={member.fullName || 'Juiz'}
                subtitle={
                  member.stationOrder
                    ? `${member.email || member.userId.slice(0, 8)} · ${stationLabel(event.segments, member.stationOrder)}`
                    : member.email || `ID ${member.userId.slice(0, 8)}…`
                }
              />
            ))
          )}
        </Screen>
      </>
    );
  }

  const ev = event;
  const eid = eventId;

  async function ensureCloudEventId(): Promise<string | null> {
    let cloudEventId = ev.supabaseId;
    if (cloudEventId) return cloudEventId;

    setLoading(true);
    try {
      const sync = await pushEventToSupabase(eid);
      if (!sync.ok) {
        Alert.alert('Nuvem', sync.reason ?? 'Não foi possível sincronizar o evento.');
        return null;
      }
      cloudEventId =
        sync.data ?? useEventsStore.getState().events.find((e) => e.id === eid)?.supabaseId ?? null;
      if (!cloudEventId) {
        Alert.alert('Nuvem', 'Evento ainda não está na nuvem. Faça login e tente novamente.');
        return null;
      }
      return cloudEventId;
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(alsoAssignToEvent: boolean) {
    if (!fullName.trim()) {
      Alert.alert('Nome', 'Informe o nome do juiz.');
      return;
    }
    if (!email.trim()) {
      Alert.alert('E-mail', 'Informe o e-mail do juiz.');
      return;
    }
    if (!password.trim() || password.length < 6) {
      Alert.alert('Senha', 'Defina uma senha com pelo menos 6 caracteres.');
      return;
    }

    const registeredName = fullName.trim();
    setLoading(true);
    try {
      if (alsoAssignToEvent) {
        const cloudEventId = await ensureCloudEventId();
        if (!cloudEventId) return;

        const result = await registerJudgeForEvent(
          cloudEventId,
          fullName,
          email,
          password,
          null,
        );
        if (!result.ok) {
          Alert.alert('Não foi possível', result.reason);
          return;
        }
        setFullName('');
        setEmail('');
        setPassword('');
        await loadStaff();
        Alert.alert(
          'Juiz cadastrado',
          `${registeredName} foi adicionado a este evento. Defina a estação no card abaixo.`,
        );
        return;
      }

      const result = await registerOrganizerJudge(fullName, email, password);
      if (!result.ok) {
        Alert.alert('Não foi possível', result.reason);
        return;
      }
      setFullName('');
      setEmail('');
      setPassword('');
      await loadStaff();
      Alert.alert(
        'Juiz cadastrado',
        'O juiz já pode entrar no app. Depois, adicione-o a um evento e defina a estação.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    await handleRegister(true);
  }

  async function handleRegisterOnly() {
    await handleRegister(false);
  }

  async function handleRemove(staffRowId: string) {
    const result = await removeEventStaff(staffRowId);
    if (!result.ok) {
      Alert.alert('Erro', result.reason);
      return;
    }
    await loadStaff();
  }

  async function handleChangeStation(member: EventStaffMember, order: number | null) {
    const result =
      order == null
        ? await clearEventStaffStation(member.id)
        : await updateEventStaffStation(member.id, order);
    if (!result.ok) {
      Alert.alert('Erro', result.reason);
      return;
    }
    await loadStaff();
  }

  async function handleReactivateLogin(member: EventStaffMember) {
    if (!password.trim() || password.length < 6) {
      Alert.alert('Senha', 'Preencha a senha do juiz no formulário acima (mín. 6 caracteres).');
      return;
    }
    const judgeEmail = member.email || email.trim();
    if (!judgeEmail) {
      Alert.alert('E-mail', 'Não foi possível identificar o e-mail do juiz.');
      return;
    }
    const result = await reactivateJudgeLogin(member.userId, judgeEmail, password);
    if (!result.ok) {
      Alert.alert('Não foi possível', result.reason);
      return;
    }
    Alert.alert('Login liberado', 'O juiz já pode entrar com este e-mail e senha.');
  }

  async function handleAssignExisting(judge: OrganizerJudge) {
    const cloudEventId = await ensureCloudEventId();
    if (!cloudEventId) return;

    setLoading(true);
    try {
      const result = await assignExistingJudgeToEvent(cloudEventId, judge.userId, null);
      if (!result.ok) {
        Alert.alert('Não foi possível', result.reason);
        return;
      }
      await loadStaff();
      Alert.alert(
        'Juiz designado',
        `${judge.fullName || judge.email} foi adicionado a este evento. Defina a estação no card abaixo.`,
      );
    } finally {
      setLoading(false);
    }
  }

  const assignedUserIds = new Set(staff.map((member) => member.userId));
  const availableOrganizerJudges = organizerJudges.filter(
    (judge) => !assignedUserIds.has(judge.userId),
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Juízes' }} />
      <Screen scroll>
        <Text style={styles.heading}>Cadastrar juízes</Text>
        <Text style={styles.subheading}>
          Primeiro cadastre o juiz (conta de login). Depois adicione-o a este evento e defina a
          estação no card — não precisa escolher estação antes.
        </Text>

        <Card
          title="Conta conectada"
          subtitle={
            authUser?.email
              ? `${authUser.email}${event.supabaseId ? ` · evento na nuvem` : ' · sincronizando evento…'}`
              : 'Sem login'
          }
          style={{ marginBottom: 16 }}
        />

        {loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}

        {organizerJudges.length === 0 ? (
          <Card
            title="Juízes já cadastrados"
            subtitle="Nenhum juiz cadastrado ainda. Crie o primeiro no formulário abaixo."
            style={{ marginBottom: 16 }}
          />
        ) : (
          <>
            <Text style={styles.sectionTitle}>Juízes já cadastrados</Text>
            <Text style={styles.sectionHint}>
              Juízes já cadastrados na sua conta. Toque em adicionar — a estação é definida depois
              no card do juiz neste evento.
            </Text>
            {availableOrganizerJudges.length === 0 ? (
              <Card
                title="Todos já neste evento"
                subtitle="Os juízes cadastrados já estão designados para esta prova."
                style={{ marginBottom: 16 }}
              />
            ) : (
              availableOrganizerJudges.map((judge) => (
                <Card
                  key={judge.userId}
                  title={judge.fullName || 'Juiz'}
                  subtitle={`${judge.email} · ${judge.eventsCount} evento${judge.eventsCount === 1 ? '' : 's'}`}>
                  <Button
                    label="Adicionar a este evento"
                    variant="secondary"
                    disabled={loading}
                    onPress={() => handleAssignExisting(judge)}
                  />
                </Card>
              ))
            )}
          </>
        )}

        <Text style={styles.sectionTitle}>Novo juiz</Text>

        <Input
          label="Nome do juiz"
          value={fullName}
          onChangeText={setFullName}
          placeholder="Nome completo"
          autoCapitalize="words"
        />
        <Input
          label="E-mail do juiz"
          value={email}
          onChangeText={setEmail}
          placeholder="juiz@email.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Input
          label="Senha inicial"
          value={password}
          onChangeText={setPassword}
          placeholder="Obrigatória para conta nova (mín. 6)"
          secureTextEntry
        />
        <Button
          label={loading ? 'Cadastrando…' : 'Cadastrar juiz'}
          disabled={loading || !fullName.trim() || !email.trim() || password.length < 6}
          onPress={handleRegisterOnly}
          style={{ marginBottom: 8 }}
        />
        <Button
          label={loading ? 'Cadastrando…' : 'Cadastrar e adicionar a este evento'}
          variant="secondary"
          disabled={loading || !fullName.trim() || !email.trim() || password.length < 6}
          onPress={handleAdd}
          style={{ marginBottom: 20 }}
        />

        {staff.length === 0 ? (
          <Card title="Nenhum juiz neste evento" subtitle="Adicione um juiz cadastrado ou crie um novo." />
        ) : (
          <>
            <Text style={styles.sectionTitle}>Juízes deste evento</Text>
            {staff.map((member) => (
            <Card
              key={member.id}
              title={member.fullName || 'Juiz'}
              subtitle={member.email || member.userId.slice(0, 8) + '…'}>
              <StationPicker
                segments={event.segments}
                value={member.stationOrder}
                onChange={(order) => void handleChangeStation(member, order)}
                label="Estação neste evento"
                allowUnset
              />
              <Button
                label="Liberar login do juiz"
                variant="secondary"
                onPress={() => handleReactivateLogin(member)}
                style={{ marginTop: 8 }}
              />
              <Button
                label="Remover"
                variant="danger"
                onPress={() => handleRemove(member.id)}
                style={{ marginTop: 8 }}
              />
            </Card>
            ))}
          </>
        )}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  heading: { color: HyroxTheme.text, fontSize: 22, fontWeight: '800', marginBottom: 8 },
  subheading: { color: HyroxTheme.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 16 },
  sectionTitle: {
    color: HyroxTheme.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 4,
  },
  sectionHint: {
    color: HyroxTheme.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  hint: { color: HyroxTheme.warning, fontSize: 13, lineHeight: 18, marginBottom: 12 },
  errorText: { color: HyroxTheme.danger, fontSize: 13, lineHeight: 18, marginBottom: 12 },
});
