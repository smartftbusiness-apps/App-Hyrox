import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { HyroxTheme } from '@/constants/Theme';
import { APP_ROLE_DESCRIPTIONS, APP_ROLE_LABELS, type AppUserRole } from '@/src/domain/appRole';
import { pullAndMergePublicEvents } from '@/src/api/syncService';
import { useAccessModeStore } from '@/src/stores/accessModeStore';
import { useAuthStore } from '@/src/stores/authStore';
import { enterVisitorModeWithoutAccount } from '@/src/utils/visitorMode';

export default function AuthScreen() {
  const { signIn, signUp, loading } = useAuthStore();
  const appRole = useAccessModeStore((s) => s.appRole);
  const setAppRole = useAccessModeStore((s) => s.setAppRole);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [enteringVisitor, setEnteringVisitor] = useState(false);

  async function handleSubmit() {
    setError('');
    if (!email.trim() || !password) {
      setError('Informe e-mail e senha');
      return;
    }

    const result =
      mode === 'login'
        ? await signIn(email, password)
        : await signUp(email, password, fullName, appRole);

    if (!result.ok) {
      setError(result.reason);
      return;
    }

    if (result.warning) {
      Alert.alert('Entrou na conta', result.warning, [
        { text: 'OK', onPress: () => router.back() },
      ]);
      return;
    }

    if (appRole === 'viewer') {
      const sync = await pullAndMergePublicEvents();
      if (!sync.ok) {
        Alert.alert('Conta ok', `Login feito, mas: ${sync.reason}`, [
          { text: 'OK', onPress: () => router.back() },
        ]);
        return;
      }
    }

    Alert.alert(
      'Conectado',
      appRole === 'viewer'
        ? 'Modo visitante ativo. Atualize os eventos na tela inicial.'
        : 'Sincronização com a nuvem ativa.',
      [{ text: 'OK', onPress: () => router.back() }],
    );
  }

  async function handleViewerWithoutAccount() {
    setError('');
    setEnteringVisitor(true);
    try {
      const result = await enterVisitorModeWithoutAccount();
      if (!result.ok) {
        setError(result.reason);
        return;
      }
      Alert.alert(
        'Modo visitante',
        result.eventCount
          ? `${result.eventCount} evento(s) carregado(s) da nuvem.`
          : 'Nenhum evento público no momento (abertos, ao vivo ou encerrados).',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } finally {
      setEnteringVisitor(false);
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Entrar na nuvem',
          headerStyle: { backgroundColor: HyroxTheme.surface },
          headerTintColor: HyroxTheme.text,
        }}
      />
      <Screen scroll>
        <Text style={styles.heading}>Como você vai usar o app?</Text>
        <Text style={styles.subheading}>
          Organizador gerencia a prova no celular. Visitante só vê eventos pela internet.
        </Text>

        <View style={styles.roleRow}>
          {(['organizer', 'viewer'] as AppUserRole[]).map((role) => (
            <Pressable
              key={role}
              onPress={() => setAppRole(role)}
              style={[styles.roleCard, appRole === role && styles.roleCardActive]}>
              <Text style={[styles.roleTitle, appRole === role && styles.roleTitleActive]}>
                {APP_ROLE_LABELS[role]}
              </Text>
              <Text style={styles.roleDesc}>{APP_ROLE_DESCRIPTIONS[role]}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.visitorHint}>Quer só acompanhar? Não precisa de e-mail nem senha.</Text>
        <Button
          label={enteringVisitor ? 'Carregando eventos…' : 'Entrar como visitante sem conta'}
          variant="primary"
          disabled={enteringVisitor || loading}
          onPress={handleViewerWithoutAccount}
          style={styles.viewerSkip}
          large
        />

        <Text style={styles.dividerLabel}>Ou entre com conta</Text>

        <View style={styles.modeRow}>
          <Button
            label="Entrar"
            variant={mode === 'login' ? 'primary' : 'secondary'}
            onPress={() => setMode('login')}
            style={styles.modeBtn}
          />
          <Button
            label="Criar conta"
            variant={mode === 'signup' ? 'primary' : 'secondary'}
            onPress={() => setMode('signup')}
            style={styles.modeBtn}
          />
        </View>

        {mode === 'signup' && (
          <Input
            label="Nome"
            value={fullName}
            onChangeText={setFullName}
            placeholder="Seu nome"
            autoCapitalize="words"
          />
        )}

        <Input
          label="E-mail"
          value={email}
          onChangeText={setEmail}
          placeholder="seu@email.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Input
          label="Senha"
          value={password}
          onChangeText={setPassword}
          placeholder="Mínimo 6 caracteres"
          secureTextEntry
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button
          label={mode === 'login' ? 'Entrar' : 'Criar conta'}
          large
          disabled={loading}
          onPress={handleSubmit}
          style={styles.submit}
        />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  heading: {
    color: HyroxTheme.text,
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 8,
  },
  subheading: {
    color: HyroxTheme.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
  roleRow: {
    gap: 10,
    marginBottom: 16,
  },
  roleCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
    backgroundColor: HyroxTheme.surface,
    padding: 14,
  },
  roleCardActive: {
    borderColor: HyroxTheme.accent,
    backgroundColor: HyroxTheme.surfaceElevated,
  },
  roleTitle: {
    color: HyroxTheme.text,
    fontWeight: '700',
    fontSize: 16,
    marginBottom: 4,
  },
  roleTitleActive: {
    color: HyroxTheme.accent,
  },
  roleDesc: {
    color: HyroxTheme.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  visitorHint: {
    color: HyroxTheme.textMuted,
    fontSize: 14,
    marginBottom: 10,
  },
  viewerSkip: {
    marginBottom: 20,
  },
  dividerLabel: {
    color: HyroxTheme.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  modeBtn: {
    flex: 1,
  },
  error: {
    color: HyroxTheme.danger,
    marginBottom: 12,
    fontSize: 14,
  },
  submit: {
    marginTop: 8,
  },
});
