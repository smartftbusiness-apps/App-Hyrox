import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { HyroxTheme } from '@/constants/Theme';
import { APP_ROLE_DESCRIPTIONS, APP_ROLE_LABELS, type AppUserRole } from '@/src/domain/appRole';
import { useAccessModeStore } from '@/src/stores/accessModeStore';
import { useAuthStore } from '@/src/stores/authStore';

export default function AuthScreen() {
  const { signIn, signUp, signOut, resetPassword, loading, user } = useAuthStore();
  const appRole = useAccessModeStore((s) => s.appRole);
  const setAppRole = useAccessModeStore((s) => s.setAppRole);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');

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

    const message = result.warning ?? 'Sincronização com a nuvem ativa.';
    Alert.alert('Conectado', message, [{ text: 'OK', onPress: () => router.back() }]);
  }

  async function handleResetPassword() {
    setError('');
    const result = await resetPassword(email);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    Alert.alert(
      'E-mail enviado',
      result.warning ??
        'Verifique sua caixa de entrada para redefinir a senha.',
    );
  }

  async function handleSignOut() {
    await signOut();
    setPassword('');
    Alert.alert('Saiu da conta', 'Você foi desconectado.');
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Conta',
          headerStyle: { backgroundColor: HyroxTheme.surface },
          headerTintColor: HyroxTheme.text,
        }}
      />
      <Screen scroll>
        <Text style={styles.heading}>Entrar no App Hyrox</Text>
        <Text style={styles.subheading}>
          Todos os usuários precisam de e-mail e senha. Na criação de conta, escolha se é organizador
          ou juiz.
        </Text>

        {user && (
          <View style={styles.loggedInBox}>
            <Text style={styles.loggedInLabel}>Conectado como</Text>
            <Text style={styles.loggedInEmail}>{user.email}</Text>
            <Button
              label="Sair da conta"
              variant="danger"
              onPress={handleSignOut}
              style={styles.signOutBtn}
            />
          </View>
        )}

        {mode === 'signup' && (
          <View style={styles.roleRow}>
            {(['organizer', 'judge'] as AppUserRole[]).map((role) => (
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
        )}

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

        {mode === 'login' && (
          <Button
            label="Redefinir senha por e-mail"
            variant="secondary"
            disabled={loading || !email.trim()}
            onPress={handleResetPassword}
            style={styles.resetBtn}
          />
        )}

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
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 8,
  },
  subheading: {
    color: HyroxTheme.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
  loggedInBox: {
    backgroundColor: HyroxTheme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
    padding: 14,
    marginBottom: 20,
  },
  loggedInLabel: {
    color: HyroxTheme.textMuted,
    fontSize: 12,
    marginBottom: 4,
  },
  loggedInEmail: {
    color: HyroxTheme.text,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 12,
  },
  signOutBtn: { width: '100%' },
  roleRow: { gap: 10, marginBottom: 16 },
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
  roleTitleActive: { color: HyroxTheme.accent },
  roleDesc: { color: HyroxTheme.textMuted, fontSize: 13, lineHeight: 18 },
  modeRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  modeBtn: { flex: 1 },
  resetBtn: { marginBottom: 12 },
  error: { color: HyroxTheme.danger, marginBottom: 12, fontSize: 14 },
  submit: { marginTop: 8 },
});
