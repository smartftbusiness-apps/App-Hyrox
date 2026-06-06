import { Alert, Platform } from 'react-native';

/** Confirmação que funciona no web e no mobile (Alert.onPress async falha no web). */
export function confirmAsync(
  title: string,
  message: string,
  confirmLabel = 'Confirmar',
): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}
