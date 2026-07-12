import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { EventStatus } from '@/src/domain/types';
import productionDefaults from '../../supabase.config.json';

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

function isValidAnonKey(key: string): boolean {
  const trimmed = key?.trim();
  if (!trimmed || trimmed.includes('sua_anon_key') || trimmed.includes('SEU_')) return false;
  if (trimmed.startsWith('sb_publishable_')) return trimmed.length > 20;
  const parts = trimmed.split('.');
  return parts.length === 3 && trimmed.startsWith('eyJ');
}

function isValidSupabaseUrl(url: string): boolean {
  if (!url || url.includes('SEU_PROJECT_REF')) return false;
  try {
    return new URL(url).hostname.endsWith('supabase.co');
  } catch {
    return false;
  }
}

function pickFirstValidUrl(...candidates: Array<string | undefined>): string {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed && isValidSupabaseUrl(trimmed)) return trimmed;
  }
  return productionDefaults.url;
}

function pickFirstValidKey(...candidates: Array<string | undefined>): string {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed && isValidAnonKey(trimmed)) return trimmed;
  }
  return productionDefaults.anonKey;
}

function resolveSupabaseConfig(): { url: string; anonKey: string } {
  const extra = readExtra();
  const url = pickFirstValidUrl(
    extra.supabaseUrl,
    process.env.EXPO_PUBLIC_SUPABASE_URL,
    productionDefaults.url,
  );
  const anonKey = pickFirstValidKey(
    extra.supabaseAnonKey,
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    productionDefaults.anonKey,
  );
  return { url, anonKey };
}

let client: SupabaseClient | null = null;
let activeConfig: { url: string; anonKey: string } | null = null;

export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = resolveSupabaseConfig();
  return isValidSupabaseUrl(url) && isValidAnonKey(anonKey);
}

export function getSupabaseConfig(): { url: string; anonKey: string } {
  return resolveSupabaseConfig();
}

export function resetSupabaseClient(): void {
  client = null;
  activeConfig = null;
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
  resetSupabaseClient();
}

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error(
      'Supabase não configurado. Defina EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }

  const config = resolveSupabaseConfig();
  const configChanged =
    !activeConfig ||
    activeConfig.url !== config.url ||
    activeConfig.anonKey !== config.anonKey;

  if (!client || configChanged) {
    client = createClient(config.url, config.anonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
    activeConfig = config;
  }

  return client;
}

const noopStorage = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
};

/** Cliente sem sessão persistente — usado pelo organizador para criar conta de juiz sem deslogar. */
export function createEphemeralSupabase(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error(
      'Supabase não configurado. Defina EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }
  const config = resolveSupabaseConfig();
  return createClient(config.url, config.anonKey, {
    auth: {
      storage: noopStorage,
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export type DbEventRow = {
  id: string;
  organizer_id: string;
  name: string;
  event_date: string;
  location: string;
  status: EventStatus;
};
