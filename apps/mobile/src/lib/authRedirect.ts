import * as Linking from 'expo-linking';

/** Deve estar em Supabase → Authentication → URL Configuration → Redirect URLs */
export const AUTH_REDIRECT_PATH = 'auth';

export function getAuthRedirectUrl(): string {
  return Linking.createURL(AUTH_REDIRECT_PATH, { scheme: 'apphyrox' });
}
