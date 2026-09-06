import * as Linking from 'expo-linking';
import { getSupabase, isSupabaseConfigured } from '@/src/lib/supabase';

function collectParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  const hashIndex = url.indexOf('#');
  if (hashIndex >= 0) {
    new URLSearchParams(url.slice(hashIndex + 1)).forEach((value, key) => {
      params[key] = value;
    });
  }
  const queryIndex = url.indexOf('?');
  if (queryIndex >= 0) {
    const end = hashIndex >= 0 ? hashIndex : url.length;
    new URLSearchParams(url.slice(queryIndex + 1, end)).forEach((value, key) => {
      params[key] = value;
    });
  }
  const parsed = Linking.parse(url);
  if (parsed.queryParams) {
    for (const [key, value] of Object.entries(parsed.queryParams)) {
      if (typeof value === 'string') params[key] = value;
    }
  }
  return params;
}

export async function handleAuthDeepLink(url: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  if (!url.includes('auth') && !url.includes('access_token') && !url.includes('token_hash')) {
    return false;
  }

  const params = collectParams(url);
  const supabase = getSupabase();

  if (params.access_token && params.refresh_token) {
    const { error } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });
    return !error;
  }

  const tokenHash = params.token_hash;
  const type = params.type;
  if (tokenHash && type) {
    const otpType =
      type === 'signup' || type === 'email' || type === 'recovery' || type === 'invite'
        ? type
        : 'email';
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType,
    });
    return !error;
  }

  return false;
}
