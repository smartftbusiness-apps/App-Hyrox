import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router';
import { HyroxTheme } from '@/constants/Theme';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { useIsViewerMode } from '@/src/stores/accessModeStore';

export default function TabLayout() {
  const isViewer = useIsViewerMode();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: HyroxTheme.accent,
        tabBarInactiveTintColor: HyroxTheme.textMuted,
        tabBarStyle: {
          backgroundColor: HyroxTheme.surface,
          borderTopColor: HyroxTheme.border,
        },
        headerStyle: {
          backgroundColor: HyroxTheme.surface,
        },
        headerTintColor: HyroxTheme.text,
        headerTitleStyle: { fontWeight: '700' },
        headerShown: useClientOnlyValue(false, true),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Eventos',
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'calendar', android: 'calendar_today', web: 'calendar_today' }} tintColor={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="athletes"
        options={{
          title: 'Atletas',
          href: isViewer ? null : undefined,
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'person.2', android: 'group', web: 'group' }} tintColor={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="timing"
        options={{
          title: 'Cronômetro',
          href: isViewer ? null : undefined,
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'stopwatch', android: 'timer', web: 'timer' }} tintColor={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: 'Ranking',
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'trophy', android: 'emoji_events', web: 'emoji_events' }} tintColor={color} size={24} />
          ),
        }}
      />
    </Tabs>
  );
}
