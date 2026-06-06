import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { HyroxTheme } from '@/constants/Theme';

export default function ModalScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>App Hyrox — Preview</Text>
      <Text style={styles.text}>
        Fase 0: protótipo navegável com dados mockados. Use as abas para explorar eventos, atletas,
        cronômetro interativo e ranking por categoria.
      </Text>
      <Text style={styles.text}>
        Para ver no navegador:{'\n'}
        <Text style={styles.code}>npm run web</Text>
      </Text>
      <Text style={styles.text}>
        No celular: instale o app Expo Go e escaneie o QR code do terminal.
      </Text>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: HyroxTheme.background,
    padding: 24,
    justifyContent: 'center',
  },
  title: {
    color: HyroxTheme.accent,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 16,
  },
  text: {
    color: HyroxTheme.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12,
  },
  code: {
    color: HyroxTheme.text,
    fontFamily: 'SpaceMono',
    fontSize: 13,
  },
});
