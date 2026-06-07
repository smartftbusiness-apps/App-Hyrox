import { useFonts } from 'expo-font';
import { DarkTheme, ThemeProvider, Stack } from 'expo-router';
import * as Linking from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect } from 'react';
import 'react-native-reanimated';
import { HyroxTheme } from '@/constants/Theme';
import { handleAuthDeepLink } from '@/src/lib/authDeepLink';
import { hydrateAuthStore } from '@/src/stores/authStore';
import { navigateToEventsHome } from '@/src/utils/navigation';
import { useCloudStatusStore } from '@/src/stores/cloudStatusStore';
import { isSupabaseConfigured } from '@/src/lib/supabase';
import { hydrateAthletesStore, syncAthletesWithEvents } from '@/src/stores/athletesStore';
import { hydrateEventsStore, useEventsStore } from '@/src/stores/eventsStore';

import { ErrorFallback } from '@/components/ErrorFallback';

export function ErrorBoundary(props: React.ComponentProps<typeof ErrorFallback>) {
  return <ErrorFallback {...props} />;
}

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

const HyroxDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: HyroxTheme.accent,
    background: HyroxTheme.background,
    card: HyroxTheme.surface,
    text: HyroxTheme.text,
    border: HyroxTheme.border,
  },
};

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  useEffect(() => {
    Promise.all([hydrateEventsStore(), hydrateAthletesStore()])
      .then(() => syncAthletesWithEvents())
      .then(() => hydrateAuthStore())
      .then(async () => {
        if (isSupabaseConfigured()) {
          await useCloudStatusStore.getState().checkCloud();
        }
      })
      .catch(() => {
        useEventsStore.getState().setHydrated(true);
      });
  }, []);

  useEffect(() => {
    const handleUrl = (url: string) => {
      void handleAuthDeepLink(url).then((handled) => {
        if (!handled) return;
        void hydrateAuthStore().then(() => navigateToEventsHome());
      });
    };

    void Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });

    const subscription = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => subscription.remove();
  }, []);

  if (!loaded) {
    return null;
  }

  return (
    <ThemeProvider value={HyroxDarkTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="event/[id]" options={{ headerShown: false }} />
        <Stack.Screen
          name="auth"
          options={{
            headerStyle: { backgroundColor: HyroxTheme.surface },
            headerTintColor: HyroxTheme.text,
            title: 'Conta',
          }}
        />
        <Stack.Screen
          name="event/new"
          options={{
            headerStyle: { backgroundColor: HyroxTheme.surface },
            headerTintColor: HyroxTheme.text,
          }}
        />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Sobre o app' }} />
      </Stack>
    </ThemeProvider>
  );
}
