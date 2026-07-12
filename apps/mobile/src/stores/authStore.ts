import type { Session, User } from '@supabase/supabase-js';

import { create } from 'zustand';

import type { AppUserRole } from '@/src/domain/appRole';

import { fromSupabaseProfileRole, toSupabaseProfileRole } from '@/src/domain/appRole';

import { getAuthRedirectUrl } from '@/src/lib/authRedirect';
import {
  clearSupabaseAuthStorage,
  getSupabase,
  isSupabaseConfigured,
  resetSupabaseClient,
} from '@/src/lib/supabase';

import { pullAndMergeFromSupabase, pullAndMergeAthleteEvents, pullAndMergeJudgeEvents } from '@/src/api/syncService';

import { useAccessModeStore } from '@/src/stores/accessModeStore';

import { useEventStaffStore } from '@/src/stores/eventStaffStore';

import { reconcileOrganizerWithAuth } from '@/src/utils/organizerReconcile';

import { translateAuthError, translateSyncError } from '@/src/utils/authErrors';



export type AuthActionResult =

  | { ok: true; warning?: string }

  | { ok: false; reason: string };



type AuthState = {

  session: Session | null;

  user: User | null;

  loading: boolean;

  hydrated: boolean;

  signIn: (email: string, password: string) => Promise<AuthActionResult>;

  signUp: (

    email: string,

    password: string,

    fullName?: string,

    role?: AppUserRole,

  ) => Promise<AuthActionResult>;

  signOut: () => Promise<void>;

  resetPassword: (email: string) => Promise<AuthActionResult>;

  hydrate: () => Promise<void>;

};



async function bootstrapOrganizerProfileOnLogin(): Promise<void> {
  const { error } = await getSupabase().rpc('bootstrap_organizer_profile');
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('function') && msg.includes('does not exist')) return;
    throw new Error(error.message);
  }
}

async function assertJudgeProfile(userId: string): Promise<AuthActionResult | null> {
  const { data, error } = await getSupabase()
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (error) return { ok: false, reason: error.message };
  if (data?.role !== 'staff') {
    return {
      ok: false,
      reason:
        'Esta conta não é de juiz. Peça ao organizador para cadastrá-lo de novo ou use o e-mail e a senha que ele definiu, com o perfil Juiz selecionado.',
    };
  }
  return null;
}

async function reconcileAuthUser(user: User | null): Promise<void> {
  if (!user?.id) return;
  await applyProfileRole(user.id);
  if (useAccessModeStore.getState().isOrganizer()) {
    await bootstrapOrganizerProfileOnLogin().catch(() => undefined);
    reconcileOrganizerWithAuth(user.id);
  }
}


async function applyProfileRole(userId: string): Promise<void> {

  const roleFromMeta = useAccessModeStore.getState().appRole;

  const { data } = await getSupabase()

    .from('profiles')

    .select('role')

    .eq('id', userId)

    .maybeSingle();



  const mapped = fromSupabaseProfileRole(data?.role as string | undefined);

  if (mapped) {

    useAccessModeStore.getState().setAppRole(mapped);

    return;

  }

  useAccessModeStore.getState().setAppRole(roleFromMeta);

}



function isInvalidApiKeyError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('invalid api key') || lower.includes('invalid jwt');
}

async function recoverFromInvalidApiKey(): Promise<void> {
  await clearSupabaseAuthStorage();
  resetSupabaseClient();
}

async function syncAfterAuth(userId: string, userEmail?: string | null): Promise<string | undefined> {
  if (useAccessModeStore.getState().isAthlete()) {
    if (!userEmail) return 'Conta sem e-mail — não foi possível carregar suas provas.';
    const result = await pullAndMergeAthleteEvents(userEmail);
    return result.ok ? undefined : result.reason;
  }

  if (useAccessModeStore.getState().isJudge()) {

    const result = await pullAndMergeJudgeEvents(userId);

    return result.ok ? undefined : result.reason;

  }

  try {

    await pullAndMergeFromSupabase(userId);

    return undefined;

  } catch (err) {

    return translateSyncError(err);

  }

}



export const useAuthStore = create<AuthState>()((set, get) => ({

  session: null,

  user: null,

  loading: false,

  hydrated: false,



  hydrate: async () => {

    if (!isSupabaseConfigured()) {

      set({ hydrated: true });

      return;

    }



    const supabase = getSupabase();

    let data: Awaited<ReturnType<typeof supabase.auth.getSession>>['data'];
    try {
      ({ data } = await supabase.auth.getSession());
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : '';
      if (msg.includes('invalid api key') || msg.includes('jwt')) {
        await clearSupabaseAuthStorage();
        ({ data } = await supabase.auth.getSession());
      } else {
        throw err;
      }
    }

    const session = data.session ?? null;

    set({ session, user: session?.user ?? null, hydrated: true });

    supabase.auth.onAuthStateChange((_event, nextSession) => {
      set({ session: nextSession, user: nextSession?.user ?? null });
      if (nextSession?.user) {
        void reconcileAuthUser(nextSession.user);
      }
    });

    if (!session?.user) {
      useEventStaffStore.getState().clear();
      return;
    }

    await reconcileAuthUser(session.user);
    await syncAfterAuth(session.user.id, session.user.email).catch(() => undefined);
  },



  signIn: async (email, password) => {

    if (!isSupabaseConfigured()) {

      return {

        ok: false,

        reason:

          'Supabase não configurado neste app. No PC: confira o arquivo .env e reinicie. No APK: instale a versão mais recente do build.',

      };

    }

    set({ loading: true });

    try {

      let { data, error } = await getSupabase().auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error && isInvalidApiKeyError(error.message)) {
        await recoverFromInvalidApiKey();
        ({ data, error } = await getSupabase().auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        }));
      }

      if (error) return { ok: false, reason: translateAuthError(error.message) };

      if (data.user && useAccessModeStore.getState().isJudge()) {
        const judgeCheck = await assertJudgeProfile(data.user.id);
        if (judgeCheck) {
          await getSupabase().auth.signOut();
          set({ session: null, user: null });
          return judgeCheck;
        }
      }

      set({ session: data.session, user: data.user });

      let warning: string | undefined;

      if (data.user) {
        try {
          await reconcileAuthUser(data.user);
          warning = await syncAfterAuth(data.user.id, data.user.email);
        } catch (syncError) {
          warning = translateSyncError(syncError);
        }
      }

      return warning ? { ok: true, warning } : { ok: true };

    } finally {

      set({ loading: false });

    }

  },



  signUp: async (email, password, fullName, role = 'organizer') => {

    if (!isSupabaseConfigured()) {

      return {

        ok: false,

        reason:

          'Supabase não configurado neste app. No PC: confira o arquivo .env e reinicie. No APK: instale a versão mais recente do build.',

      };

    }

    useAccessModeStore.getState().setAppRole(role);

    set({ loading: true });

    try {

      const meta: Record<string, string> = { role: toSupabaseProfileRole(role) };

      if (fullName?.trim()) meta.full_name = fullName.trim();



      const signUpOptions = {
        data: meta,
        emailRedirectTo: getAuthRedirectUrl(),
      };

      const normalizedEmail = email.trim().toLowerCase();

      let { data, error } = await getSupabase().auth.signUp({
        email: normalizedEmail,
        password,
        options: signUpOptions,
      });

      if (error && isInvalidApiKeyError(error.message)) {
        await recoverFromInvalidApiKey();
        ({ data, error } = await getSupabase().auth.signUp({
          email: normalizedEmail,
          password,
          options: signUpOptions,
        }));
      }

      if (error) return { ok: false, reason: translateAuthError(error.message) };

      if (!data.session) {

        return {

          ok: false,

          reason:

            'Conta criada! Abra o e-mail do Supabase (verifique spam), clique no link de confirmação e depois use Entrar com a mesma senha.',

        };

      }



      set({ session: data.session, user: data.user });

      let warning: string | undefined;
      if (data.user && data.session) {
        try {
          await reconcileAuthUser(data.user);
          warning = await syncAfterAuth(data.user.id, data.user.email);
        } catch (syncError) {
          warning = translateSyncError(syncError);
        }
      }

      return warning ? { ok: true, warning } : { ok: true };

    } finally {

      set({ loading: false });

    }

  },



  signOut: async () => {
    if (isSupabaseConfigured()) {
      try {
        await getSupabase().auth.signOut();
      } catch {
        // ignore — limpa storage local abaixo
      }
    }
    await clearSupabaseAuthStorage();
    useAccessModeStore.getState().setAppRole('organizer');
    useEventStaffStore.getState().clear();
    set({ session: null, user: null });
  },

  resetPassword: async (email) => {
    if (!isSupabaseConfigured()) {
      return {
        ok: false,
        reason:
          'Supabase não configurado neste app. No PC: confira o arquivo .env e reinicie. No APK: instale a versão mais recente do build.',
      };
    }

    const trimmed = email.trim();
    if (!trimmed) {
      return { ok: false, reason: 'Informe o e-mail da sua conta.' };
    }

    set({ loading: true });
    try {
      const { error } = await getSupabase().auth.resetPasswordForEmail(trimmed, {
        redirectTo: getAuthRedirectUrl(),
      });
      if (error) return { ok: false, reason: translateAuthError(error.message) };
      return {
        ok: true,
        warning:
          'Enviamos um e-mail com o link para criar uma nova senha. Verifique a caixa de entrada e o spam.',
      };
    } finally {
      set({ loading: false });
    }
  },

}));



export async function hydrateAuthStore(): Promise<void> {

  await useAuthStore.getState().hydrate();

}



export function useIsAuthenticated(): boolean {

  return useAuthStore((s) => !!s.user);

}

