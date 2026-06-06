import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { HyroxTheme } from '@/constants/Theme';
import { useAuthStore } from '@/src/stores/authStore';

export default function AuthScreen() {
  const { signIn, signUp, loading } = useAuthStore();
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
        : await signUp(email, password, fullName);

    if (!result.ok) {
      setError(result.reason);
      return;
    }

    Alert.alert('Conectado', 'Sincronização com Supabase ativa.', [
      { text: 'OK', onPress: () => router.back() },
    ]);
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Conta organizador',
          headerStyle: { backgroundColor: HyroxTheme.surface },
          headerTintColor: HyroxTheme.text,
        }}
      />
      <Screen scroll>
        <Text style={styles.heading}>Supabase</Text>
        <Text style={styles.subheading}>
          Faça login para salvar eventos, atletas, duplas e tempos na nuvem.
        </Text>

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
          placeholder="organizador@email.com"
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
    marginBottom: 24,
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
