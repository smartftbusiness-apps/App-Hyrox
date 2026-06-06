import { Stack } from 'expo-router';
import { HyroxTheme } from '@/constants/Theme';

export default function EventLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: HyroxTheme.surface },
        headerTintColor: HyroxTheme.text,
        headerTitleStyle: { fontWeight: '700' },
      }}
    />
  );
}
