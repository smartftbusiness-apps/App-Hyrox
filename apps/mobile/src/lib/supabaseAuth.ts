import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/src/lib/supabaseConfig';

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  user?: unknown;
  msg?: string;
  message?: string;
  error_description?: string;
  error?: string;
};

export async function signInWithPasswordDirect(
  email: string,
  password: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      password,
    }),
  });

  const payload = (await response.json()) as TokenResponse;
  if (!response.ok) {
    throw new Error(
      payload.msg ||
        payload.message ||
        payload.error_description ||
        payload.error ||
        `Falha no login (${response.status})`,
    );
  }

  if (!payload.access_token || !payload.refresh_token) {
    throw new Error('Resposta de login incompleta do Supabase.');
  }

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
  };
}
