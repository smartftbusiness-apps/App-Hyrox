import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { EventStatus } from '@/src/domain/types';

const extra = Constants.expoConfig?.extra as
  | { supabaseUrl?: string; supabaseAnonKey?: string }
  | undefined;

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra?.supabaseUrl ?? '';
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? extra?.supabaseAnonKey ?? '';

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

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase não configurado. Defina EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY.');
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
