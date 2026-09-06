import { router } from 'expo-router';
import { Platform } from 'react-native';

/** Volta para a lista de eventos (aba inicial). */
export function navigateToEventsHome(): void {
  // dismissAll dispara POP_TO_TOP — no web não há stack que trate essa ação
  if (
    Platform.OS !== 'web' &&
    typeof router.canDismiss === 'function' &&
    router.canDismiss()
  ) {
    router.dismissAll();
  }
  router.replace('/(tabs)');
}
