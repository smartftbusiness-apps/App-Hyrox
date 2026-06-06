import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { EventStatus } from '@/src/domain/types';

type SupabaseExtra = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

function readExtra(): SupabaseExtra {
  const c = Constants as typeof Constants & {
    manifest?: { extra?: SupabaseExtra };
    manifest2?: { extra?: { expoClient?: { extra?: SupabaseExtra } } };
  };
  const fromExpo = c.expoConfig?.extra as SupabaseExtra | undefined;
  const fromManifest = c.manifest?.extra;
  const fromManifest2 = c.manifest2?.extra?.expoClient?.extra;
  return { ...fromManifest2, ...fromManifest, ...fromExpo };
}

const extra = readExtra();

const supabaseUrl = (
  extra.supabaseUrl ??
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  ''
).trim();

const supabaseAnonKey = (
  extra.supabaseAnonKey ??
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  ''
).trim();

let client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  if (!supabaseUrl || !supabaseAnonKey) return false;
  if (
    supabaseUrl.includes('SEU_PROJECT_REF') ||
    supabaseAnonKey.includes('sua_anon_key')
  ) {
    return false;
  }
  try {
    const parsed = new URL(supabaseUrl);
    return parsed.hostname.endsWith('supabase.co');
  } catch {
    return false;
  }
}

export function getSupabaseConfig(): { url: string; anonKey: string } {
  return { url: supabaseUrl, anonKey: supabaseAnonKey };
}

/** Limpa sessão antiga (ex.: troca de projeto Supabase no mesmo aparelho) */
export async function clearSupabaseAuthStorage(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const authKeys = keys.filter(
      (k) => k.includes('supabase') || k.startsWith('sb-'),
    );
    if (authKeys.length) await AsyncStorage.multiRemove(authKeys);
  } catch {
    // ignore
  }
  client = null;
}

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error(
      'Supabase não configurado. Defina EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }
  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

export type DbEventRow = {
  id: string;
  organizer_id: string;
  name: string;
  event_date: string;
  location: string;
  status: EventStatus;
};
