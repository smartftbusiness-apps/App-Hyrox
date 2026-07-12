import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { EventStatus } from '@/src/domain/types';
import {
  SUPABASE_ANON_KEY,
  SUPABASE_BUILD_ID,
  SUPABASE_URL,
} from '@/src/lib/supabaseConfig';

function resolveSupabaseConfig(): { url: string; anonKey: string } {
  return { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY };
}

export type SupabaseConnectionStatus = 'ok' | 'invalid_key' | 'offline' | 'not_configured';

/** Testa se a chave embutida no app é aceita pelo Supabase Auth. */
export async function verifySupabaseConnection(): Promise<SupabaseConnectionStatus> {
  if (!isSupabaseConfigured()) return 'not_configured';
  const { url, anonKey } = resolveSupabaseConfig();
  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    });
    if (response.status === 401 || response.status === 403) return 'invalid_key';
    if (!response.ok) return 'offline';
    return 'ok';
  } catch {
    return 'offline';
  }
}

const SUPABASE_PROJECT_REF_KEY = 'hyrox-supabase-project-ref';

export function getSupabaseProjectRef(url?: string): string | null {
  const target = url ?? resolveSupabaseConfig().url;
  try {
    return new URL(target).hostname.split('.')[0] || null;
  } catch {
    return null;
  }
}

export type SupabaseDiagnostics = {
  projectRef: string | null;
  url: string;
  keyKind: 'publishable' | 'jwt' | 'unknown';
  keyPreview: string;
  buildId: string;
  keyLength: number;
};

export function getSupabaseDiagnostics(): SupabaseDiagnostics {
  const { url, anonKey } = resolveSupabaseConfig();
  const keyKind = anonKey.startsWith('sb_publishable_')
    ? 'publishable'
    : anonKey.startsWith('eyJ')
      ? 'jwt'
      : 'unknown';
  const keyPreview =
    anonKey.length <= 12 ? anonKey : `${anonKey.slice(0, 16)}…${anonKey.slice(-6)}`;
  return {
    projectRef: getSupabaseProjectRef(url),
    url,
    keyKind,
    keyPreview,
    buildId: SUPABASE_BUILD_ID,
    keyLength: anonKey.length,
  };
}

export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = resolveSupabaseConfig();
  return !!url && !!anonKey && anonKey.length > 40;
}

/** Remove sessões de outro projeto Supabase (ex.: APK antigo no mesmo aparelho). */
export async function ensureSupabaseProjectStorage(): Promise<boolean> {
  const ref = getSupabaseProjectRef();
  if (!ref) return false;

  let cleared = false;
  try {
    const storedRef = await AsyncStorage.getItem(SUPABASE_PROJECT_REF_KEY);
    const keys = await AsyncStorage.getAllKeys();
    const foreignAuthKeys = keys.filter((key) => {
      const match = /^sb-([a-z0-9]+)-auth-token/.exec(key);
      return match != null && match[1] !== ref;
    });

    if ((storedRef && storedRef !== ref) || foreignAuthKeys.length > 0) {
      await clearSupabaseAuthStorage();
      cleared = true;
    }

    await AsyncStorage.setItem(SUPABASE_PROJECT_REF_KEY, ref);
  } catch {
    // ignore
  }

  return cleared;
}

let client: SupabaseClient | null = null;

export function resetSupabaseClient(): void {
  client = null;
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

export function getSupabaseConfig(): { url: string; anonKey: string } {
  return resolveSupabaseConfig();
}

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error(
      'Supabase não configurado. Defina EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }

  const config = resolveSupabaseConfig();

  if (!client) {
    client = createClient(config.url, config.anonKey, {
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
