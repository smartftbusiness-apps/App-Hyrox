import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { HyroxTheme } from '@/constants/Theme';
import { APP_ROLE_LABELS } from '@/src/domain/appRole';
import { pullAndMergeFromSupabase, pullAndMergePublicEvents } from '@/src/api/syncService';
import { enterVisitorModeWithoutAccount } from '@/src/utils/visitorMode';
import { isSupabaseConfigured } from '@/src/lib/supabase';
import { useAccessModeStore, useIsViewerMode } from '@/src/stores/accessModeStore';
import {
  CLOUD_STATUS_LABELS,
  useCloudStatusStore,
  type CloudStatus,
} from '@/src/stores/cloudStatusStore';
import { useAuthStore } from '@/src/stores/authStore';
import { useAthletesStore } from '@/src/stores/athletesStore';
import { useEvents } from '@/src/stores/eventsStore';

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
  const isViewer = useIsViewerMode();
  const appRole = useAccessModeStore((s) => s.appRole);
  const cloudStatus = useCloudStatusStore((s) => s.status);
  const checkCloud = useCloudStatusStore((s) => s.checkCloud);
  const [syncing, setSyncing] = useState(false);
  const [enteringVisitor, setEnteringVisitor] = useState(false);
  const supabaseOn = isSupabaseConfigured();

  const displayedEvents = isViewer
    ? events.filter((e) => e.status !== 'draft')
    : events;

  const liveCount = displayedEvents.filter((e) => e.status === 'live').length;
  const totalAthletes = allAthletes.length;

  useEffect(() => {
    if (supabaseOn) {
      void checkCloud();
    }
  }, [supabaseOn, checkCloud]);

  async function handleVisitorWithoutAccount() {
    setEnteringVisitor(true);
    try {
      const result = await enterVisitorModeWithoutAccount();
      if (!result.ok) {
        Alert.alert('Visitante', result.reason);
        return;
      }
      Alert.alert(
        'Modo visitante',
        result.eventCount
          ? `${result.eventCount} evento(s) na nuvem.`
          : 'Nenhum evento público no momento.',
      );
    } finally {
      setEnteringVisitor(false);
      if (supabaseOn) void checkCloud();
    }
  }

  async function handleRefreshOnline() {
    setSyncing(true);
    try {
      if (isViewer) {
        const result = await pullAndMergePublicEvents();
        if (!result.ok) {
          Alert.alert('Nuvem', result.reason);
          return;
        }
        Alert.alert(
          'Atualizado',
          result.eventCount
            ? `${result.eventCount} evento(s) na nuvem.`
            : 'Nenhum evento público no momento.',
        );
        return;
      }

      if (!user?.id) {
        router.push('/auth');
        return;
      }
      await pullAndMergeFromSupabase(user.id);
      Alert.alert('Atualizado', 'Seus eventos foram sincronizados.');
    } finally {
      setSyncing(false);
      if (supabaseOn) void checkCloud();
    }
  }

  return (
    <Screen scroll>
      <Text style={styles.heading}>
        {isViewer ? 'Eventos — visitante' : 'Eventos'}
      </Text>
      <Text style={styles.subheading}>
        {isViewer
          ? 'Veja provas ao vivo e rankings pela internet (somente leitura).'
          : 'Gerencie competições Hyrox no celular — com ou sem nuvem.'}
      </Text>

      {supabaseOn && !user && (
        <Card title="Só quer acompanhar?">
          <Text style={styles.visitorCardText}>
            Veja eventos ao vivo e ranking sem criar conta.
          </Text>
          <Button
            label={enteringVisitor ? 'Carregando…' : 'Entrar como visitante sem conta'}
            variant="primary"
            disabled={enteringVisitor || syncing}
            onPress={handleVisitorWithoutAccount}
            style={styles.visitorCardBtn}
          />
        </Card>
      )}

      <Card
        title={`Perfil: ${APP_ROLE_LABELS[appRole]}`}
        subtitle={
          isViewer
            ? 'Toque abaixo para buscar eventos na nuvem'
            : user
              ? `${user.email}`
              : 'Organize localmente; use a nuvem quando estiver online'
        }
        badge={supabaseOn ? CLOUD_STATUS_LABELS[cloudStatus] : 'Só no celular'}
        badgeColor={supabaseOn ? CLOUD_BADGE[cloudStatus] : HyroxTheme.textMuted + '33'}>
        <View style={styles.syncRow}>
          {supabaseOn && (
            <Button
              label={syncing ? 'Atualizando…' : isViewer ? 'Buscar na nuvem' : 'Sincronizar'}
              variant="secondary"
              disabled={syncing}
              onPress={handleRefreshOnline}
              style={styles.syncBtn}
            />
          )}
          <Button
            label={isViewer ? 'Trocar perfil' : user ? 'Conta' : 'Nuvem / conta'}
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
        {cloudStatus === 'offline' && supabaseOn ? (
          <Text style={styles.cloudHint}>
            A nuvem está fora do ar ou no limite do plano. Organizadores ainda podem usar o app no
            celular; visitantes precisam esperar voltar.
          </Text>
        ) : null}
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
        {isViewer ? 'Eventos na nuvem' : 'Próximos e ativos'}
      </Text>

      {displayedEvents.length === 0 ? (
        <Card
          title="Nenhum evento aqui"
          subtitle={
            isViewer
              ? 'Toque em Buscar na nuvem quando a conexão estiver ok'
              : 'Crie um evento ou sincronize com a nuvem'
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

      {!isViewer && (
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
  heading: {
    color: HyroxTheme.text,
    fontSize: 28,
    fontWeight: '800',
  },
  subheading: {
    color: HyroxTheme.textMuted,
    fontSize: 15,
    marginTop: 4,
    marginBottom: 20,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  stat: {
    flex: 1,
    backgroundColor: HyroxTheme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
    padding: 14,
    alignItems: 'center',
  },
  statValue: {
    color: HyroxTheme.accent,
    fontSize: 22,
    fontWeight: '800',
  },
  statLabel: {
    color: HyroxTheme.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
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
  footerText: {
    color: HyroxTheme.textMuted,
    fontSize: 13,
  },
  syncRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  syncBtn: {
    flexGrow: 1,
    minWidth: '45%',
  },
  cloudHint: {
    color: HyroxTheme.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 12,
  },
  visitorCardText: {
    color: HyroxTheme.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  visitorCardBtn: {
    width: '100%',
  },
});
