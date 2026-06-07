import { router } from 'expo-router';

import { useEffect, useMemo, useState } from 'react';

import { Alert, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';

import { Card } from '@/components/ui/Card';

import { Screen } from '@/components/ui/Screen';

import { HyroxTheme } from '@/constants/Theme';

import { APP_ROLE_LABELS } from '@/src/domain/appRole';

import { pullAndMergeFromSupabase, pullAndMergeJudgeEvents } from '@/src/api/syncService';

import { isSupabaseConfigured } from '@/src/lib/supabase';

import { useAccessModeStore, useIsJudgeMode } from '@/src/stores/accessModeStore';

import {

  CLOUD_STATUS_LABELS,

  useCloudStatusStore,

  type CloudStatus,

} from '@/src/stores/cloudStatusStore';

import { useAuthStore } from '@/src/stores/authStore';

import { useAthletesStore } from '@/src/stores/athletesStore';

import { useEventStaffStore } from '@/src/stores/eventStaffStore';

import { useEvents } from '@/src/stores/eventsStore';

import { translateSyncError } from '@/src/utils/authErrors';



const STATUS_COLORS: Record<string, string> = {

  draft: HyroxTheme.textMuted,

  open: HyroxTheme.warning,

  live: HyroxTheme.success,

  finished: HyroxTheme.textMuted,

};



const STATUS_LABELS: Record<string, string> = {

  draft: 'Rascunho',

  open: 'Inscrições',

  live: 'Ao vivo',

  finished: 'Evento encerrado',

};



const CLOUD_BADGE: Record<CloudStatus, string> = {

  unknown: HyroxTheme.textMuted + '33',

  not_configured: HyroxTheme.warning + '33',

  online: HyroxTheme.success + '33',

  offline: HyroxTheme.danger + '33',

};



export default function EventsScreen() {

  const events = useEvents();

  const allAthletes = useAthletesStore((s) => s.athletes);

  const user = useAuthStore((s) => s.user);

  const isJudge = useIsJudgeMode();

  const assignedEventIds = useEventStaffStore((s) => s.assignedEventIds);

  const appRole = useAccessModeStore((s) => s.appRole);

  const cloudStatus = useCloudStatusStore((s) => s.status);

  const checkCloud = useCloudStatusStore((s) => s.checkCloud);

  const [syncing, setSyncing] = useState(false);

  const supabaseOn = isSupabaseConfigured();



  const displayedEvents = useMemo(() => {

    if (isJudge) {

      return events.filter((e) => assignedEventIds.includes(e.id));

    }

    return events;

  }, [events, isJudge, assignedEventIds]);



  const liveCount = displayedEvents.filter((e) => e.status === 'live').length;

  const totalAthletes = allAthletes.length;



  useEffect(() => {

    if (supabaseOn) void checkCloud();

  }, [supabaseOn, checkCloud]);



  useEffect(() => {

    if (!supabaseOn || !isJudge || !user?.id) return;

    void pullAndMergeJudgeEvents(user.id);

  }, [supabaseOn, isJudge, user?.id]);



  async function handleRefreshOnline() {

    if (!user?.id) {

      router.push('/auth');

      return;

    }



    setSyncing(true);

    try {

      if (isJudge) {

        const result = await pullAndMergeJudgeEvents(user.id);

        if (!result.ok) {

          Alert.alert('Nuvem', result.reason);

          return;

        }

        Alert.alert('Atualizado', 'Eventos designados foram carregados.');

        return;

      }

      await pullAndMergeFromSupabase(user.id);

      Alert.alert('Atualizado', 'Seus eventos foram sincronizados.');

    } catch (err) {

      Alert.alert('Erro ao sincronizar', translateSyncError(err));

    } finally {

      setSyncing(false);

      if (supabaseOn) void checkCloud();

    }

  }



  return (

    <Screen scroll>

      <Text style={styles.heading}>

        {isJudge ? 'Eventos — juiz' : 'Eventos'}

      </Text>

      <Text style={styles.subheading}>

        {isJudge

          ? 'Eventos em que você foi designado. Visualização + cronômetro.'

          : 'Gerencie competições Hyrox no celular — com ou sem nuvem.'}

      </Text>



      {supabaseOn && !user && (

        <Card title="Entre na sua conta">

          <Text style={styles.loginCardText}>

            Para sincronizar com a nuvem, crie uma conta ou faça login com e-mail e senha.

          </Text>

          <Button

            label="Entrar ou criar conta"

            variant="primary"

            onPress={() => router.push('/auth')}

            style={styles.loginCardBtn}

          />

        </Card>

      )}



      <Card

        title={user ? `Perfil: ${APP_ROLE_LABELS[appRole]}` : 'Conta'}

        subtitle={

          user

            ? isJudge

              ? 'Busque eventos designados na nuvem'

              : user.email

            : 'Faça login para usar a nuvem'

        }

        badge={supabaseOn ? CLOUD_STATUS_LABELS[cloudStatus] : 'Só no celular'}

        badgeColor={supabaseOn ? CLOUD_BADGE[cloudStatus] : HyroxTheme.textMuted + '33'}>

        <View style={styles.syncRow}>

          {supabaseOn && user && (

            <Button

              label={syncing ? 'Atualizando…' : 'Sincronizar'}

              variant="secondary"

              disabled={syncing}

              onPress={handleRefreshOnline}

              style={styles.syncBtn}

            />

          )}

          <Button

            label={user ? 'Minha conta' : 'Entrar / criar conta'}

            variant="secondary"

            onPress={() => router.push('/auth')}

            style={styles.syncBtn}

          />

          {user ? (

            <Button

              label="Sair"

              variant="secondary"

              onPress={() => useAuthStore.getState().signOut()}

              style={styles.syncBtn}

            />

          ) : null}

        </View>

      </Card>



      <View style={styles.statsRow}>

        <View style={styles.stat}>

          <Text style={styles.statValue}>{displayedEvents.length}</Text>

          <Text style={styles.statLabel}>Eventos</Text>

        </View>

        <View style={styles.stat}>

          <Text style={styles.statValue}>{totalAthletes}</Text>

          <Text style={styles.statLabel}>Atletas</Text>

        </View>

        <View style={styles.stat}>

          <Text style={[styles.statValue, { color: HyroxTheme.success }]}>{liveCount}</Text>

          <Text style={styles.statLabel}>Ao vivo</Text>

        </View>

      </View>



      <Text style={styles.sectionTitle}>

        {isJudge ? 'Meus eventos' : 'Próximos e ativos'}

      </Text>



      {displayedEvents.length === 0 ? (

        <Card

          title="Nenhum evento aqui"

          subtitle={

            isJudge

              ? user

                ? 'Peça ao organizador para te designar como juiz e sincronize.'

                : 'Faça login como juiz.'

              : user

                ? 'Crie um evento ou sincronize com a nuvem'

                : 'Crie eventos localmente ou faça login'

          }

        />

      ) : null}



      {displayedEvents.map((event) => (

        <Card

          key={event.id}

          title={event.name}

          subtitle={`${event.location} · ${new Date(event.date).toLocaleDateString('pt-BR')}`}

          badge={STATUS_LABELS[event.status]}

          badgeColor={STATUS_COLORS[event.status] + '33'}

          onPress={() => router.push(`/event/${event.id}`)}>

          <View style={styles.cardFooter}>

            <Text style={styles.footerText}>

              {allAthletes.filter((a) => a.eventId === event.id).length} atletas

            </Text>

            <Text style={styles.footerText}>{event.categories.length} categorias</Text>

          </View>

        </Card>

      ))}



      {!isJudge && (

        <Card

          title="+ Novo evento"

          subtitle="Criar competição com template Hyrox (16 segmentos)"

          onPress={() => router.push('/event/new')}

        />

      )}

    </Screen>

  );

}



const styles = StyleSheet.create({

  heading: { color: HyroxTheme.text, fontSize: 26, fontWeight: '800' },

  subheading: {

    color: HyroxTheme.textMuted,

    fontSize: 15,

    lineHeight: 22,

    marginTop: 4,

    marginBottom: 20,

  },

  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },

  stat: {

    flex: 1,

    minWidth: 90,

    backgroundColor: HyroxTheme.surface,

    borderRadius: 12,

    borderWidth: 1,

    borderColor: HyroxTheme.border,

    padding: 14,

    alignItems: 'center',

  },

  statValue: { color: HyroxTheme.accent, fontSize: 22, fontWeight: '800' },

  statLabel: { color: HyroxTheme.textMuted, fontSize: 12, marginTop: 4, textAlign: 'center' },

  sectionTitle: {

    color: HyroxTheme.text,

    fontSize: 16,

    fontWeight: '700',

    marginBottom: 12,

  },

  cardFooter: {

    flexDirection: 'row',

    justifyContent: 'space-between',

    marginTop: 12,

    paddingTop: 12,

    borderTopWidth: 1,

    borderTopColor: HyroxTheme.border,

  },

  footerText: { color: HyroxTheme.textMuted, fontSize: 13 },

  syncRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },

  syncBtn: { flexGrow: 1, flexBasis: '45%', minWidth: 120 },

  loginCardText: {

    color: HyroxTheme.textMuted,

    fontSize: 14,

    lineHeight: 20,

    marginBottom: 12,

  },

  loginCardBtn: { width: '100%' },

});

