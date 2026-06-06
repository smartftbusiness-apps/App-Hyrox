import { type ErrorBoundaryProps } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { HyroxTheme } from '@/constants/Theme';

export function ErrorFallback({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Algo deu errado</Text>
      <Text style={styles.message}>
        {error.message || 'Erro inesperado ao carregar a tela.'}
      </Text>
      <Button label="Tentar novamente" onPress={retry} large style={styles.btn} />
      <Text style={styles.hint}>
        Se o problema continuar, recarregue a página (Ctrl+Shift+R) ou limpe os dados locais
        do navegador.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: HyroxTheme.background,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    color: HyroxTheme.accent,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 12,
  },
  message: {
    color: HyroxTheme.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 24,
  },
  btn: { marginBottom: 16 },
  hint: {
    color: HyroxTheme.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
});
