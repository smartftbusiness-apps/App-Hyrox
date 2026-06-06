import { useLocalSearchParams } from 'expo-router';

export function useRouteId(param = 'id'): string | undefined {
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const raw = params[param];
  if (!raw) return undefined;
  return Array.isArray(raw) ? raw[0] : raw;
}
