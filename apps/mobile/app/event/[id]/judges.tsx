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
  fetchOrganizerJudges,
  fetchStaffForEvent,
  reactivateJudgeLogin,
  registerJudgeForEvent,
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
  const [stationOrder, setStationOrder] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [organizerJudges, setOrganizerJudges] = useState<OrganizerJudge[]>(EMPTY_ORGANIZER_JUDGES);
  const staff =
    useEventStaffStore((s) => (eventId ? s.staffByEvent[eventId] : undefined)) ?? EMPTY_STAFF;

  const stationOptions = event ? stationSegmentOptions(event.segments) : [];

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

  useEffect(() => {
    if (stationOptions.length && stationOrder == null) {
      setStationOrder(stationOptions[0].order);
    }
  }, [stationOptions, stationOrder]);

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

  async function handleAdd() {
    let cloudEventId = ev.supabaseId;
    if (!cloudEventId) {
      setLoading(true);
      try {
        const sync = await pushEventToSupabase(eid);
        if (!sync.ok) {
          Alert.alert('Nuvem', sync.reason ?? 'Não foi possível sincronizar o evento.');
          return;
        }
        cloudEventId = sync.data ?? useEventsStore.getState().events.find((e) => e.id === eid)?.supabaseId;
        if (!cloudEventId) {
          Alert.alert('Nuvem', 'Evento ainda não está na nuvem. Faça login e tente novamente.');
          return;
        }
      } finally {
        setLoading(false);
      }
    }
    if (!stationOrder && stationOptions.length > 0) {
      Alert.alert('Estação', 'Selecione a estação em que o juiz atuará.');
      return;
    }
    if (!fullName.trim()) {
      Alert.alert('Nome', 'Informe o nome do juiz.');
      return;
    }
    if (!password.trim() || password.length < 6) {
      Alert.alert('Senha', 'Defina uma senha com pelo menos 6 caracteres.');
      return;
    }
    setLoading(true);
    try {
      const result = await registerJudgeForEvent(
        cloudEventId,
        fullName,
        email,
        password,
        stationOrder,
      );
      if (!result.ok) {
        Alert.alert('Não foi possível', result.reason);
        return;
      }
      setFullName('');
      setEmail('');
      setPassword('');
      await loadStaff();
      if (result.data.createdAccount) {
        if (result.data.loginReady) {
          Alert.alert(
            'Juiz cadastrado',
            'O juiz já pode entrar no app com o e-mail e a senha definidos aqui.',
          );
        } else {
          Alert.alert(
            'Juiz cadastrado',
            'Rode a migration 010 no Supabase (ou setup_completo.sql atualizado) e cadastre o juiz de novo para liberar o login imediato.',
          );
        }
      } else {
        Alert.alert(
          'Juiz designado',
          result.data.loginReady
            ? 'Este e-mail já tinha conta de juiz — ele entra com a senha que já usa.'
            : 'Este e-mail já tinha conta. O juiz usa a senha antiga dele (não a digitada agora).',
        );
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove(staffRowId: string) {
    const result = await removeEventStaff(staffRowId);
    if (!result.ok) {
      Alert.alert('Erro', result.reason);
      return;
    }
    await loadStaff();
  }

  async function handleChangeStation(member: EventStaffMember, order: number) {
    const result = await updateEventStaffStation(member.id, order);
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
    let cloudEventId = ev.supabaseId;
    if (!cloudEventId) {
      setLoading(true);
      try {
        const sync = await pushEventToSupabase(eid);
        if (!sync.ok) {
          Alert.alert('Nuvem', sync.reason ?? 'Não foi possível sincronizar o evento.');
          return;
        }
        cloudEventId =
          sync.data ?? useEventsStore.getState().events.find((e) => e.id === eid)?.supabaseId;
        if (!cloudEventId) {
          Alert.alert('Nuvem', 'Evento ainda não está na nuvem. Faça login e tente novamente.');
          return;
        }
      } finally {
        setLoading(false);
      }
    }
    setLoading(true);
    try {
      const result = await assignExistingJudgeToEvent(
        cloudEventId,
        judge.userId,
        stationOrder,
      );
      if (!result.ok) {
        Alert.alert('Não foi possível', result.reason);
        return;
      }
      await loadStaff();
      Alert.alert(
        'Juiz designado',
        stationOrder
          ? `${judge.fullName || judge.email} foi adicionado a este evento.`
          : `${judge.fullName || judge.email} foi adicionado. Defina a estação no card abaixo.`,
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
          O organizador cria a conta do juiz e define a estação (agora ou depois no card do juiz).
          O juiz entra no app com o e-mail e a senha informados aqui.
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

        <StationPicker
          segments={event.segments}
          value={stationOrder}
          onChange={setStationOrder}
          label="Estação do juiz"
        />

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
              Juízes que você já cadastrou em outros eventos. Você pode adicionar agora e escolher a
              estação depois no card do juiz, ou selecionar a estação acima antes de adicionar.
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
          label={loading ? 'Cadastrando…' : 'Cadastrar e designar juiz'}
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
                onChange={(order) => handleChangeStation(member, order)}
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
