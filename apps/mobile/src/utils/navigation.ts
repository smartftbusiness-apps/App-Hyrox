import { router } from 'expo-router';

/** Volta para a lista de eventos (aba inicial). */
export function navigateToEventsHome(): void {
  if (typeof router.dismissAll === 'function') {
    router.dismissAll();
  }
  router.replace('/');
}
