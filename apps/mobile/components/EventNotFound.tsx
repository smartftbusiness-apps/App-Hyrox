import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { HyroxTheme } from '@/constants/Theme';

export function EventNotFound() {
  return (
    <Screen>
      <View style={styles.box}>
        <Text style={styles.title}>Evento não encontrado</Text>
        <Text style={styles.text}>
          Este evento pode ter sido removido ou o link está incorreto.
        </Text>
        <Button label="Voltar aos eventos" onPress={() => router.replace('/')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  box: { flex: 1, justifyContent: 'center', gap: 12 },
  title: { color: HyroxTheme.text, fontSize: 20, fontWeight: '800' },
  text: { color: HyroxTheme.textMuted, fontSize: 14, marginBottom: 8 },
});
