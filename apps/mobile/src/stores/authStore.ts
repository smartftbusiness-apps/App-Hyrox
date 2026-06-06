import type { Session, User } from '@supabase/supabase-js';

import { create } from 'zustand';

import type { AppUserRole } from '@/src/domain/appRole';

import { fromSupabaseProfileRole, toSupabaseProfileRole } from '@/src/domain/appRole';

import { getSupabase, isSupabaseConfigured } from '@/src/lib/supabase';

import { pullAndMergeFromSupabase, pullAndMergeJudgeEvents } from '@/src/api/syncService';

import { useAccessModeStore } from '@/src/stores/accessModeStore';

import { useEventStaffStore } from '@/src/stores/eventStaffStore';

import { useOrganizerStore } from '@/src/stores/organizerStore';

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



function bindOrganizerToAuth(user: User | null): void {

  if (user?.id) {

    useOrganizerStore.setState({ organizerId: user.id });

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



async function syncAfterAuth(userId: string): Promise<string | undefined> {

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

    const { data } = await supabase.auth.getSession();

    const session = data.session ?? null;

    bindOrganizerToAuth(session?.user ?? null);

    set({ session, user: session?.user ?? null, hydrated: true });



    supabase.auth.onAuthStateChange((_event, nextSession) => {

      bindOrganizerToAuth(nextSession?.user ?? null);

      set({ session: nextSession, user: nextSession?.user ?? null });

    });



    if (!session?.user) {

      useEventStaffStore.getState().clear();

      return;

    }



    await applyProfileRole(session.user.id).catch(() => undefined);

    await syncAfterAuth(session.user.id).catch(() => undefined);

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

      const { data, error } = await getSupabase().auth.signInWithPassword({

        email: email.trim(),

        password,

      });

      if (error) return { ok: false, reason: translateAuthError(error.message) };



      bindOrganizerToAuth(data.user);

      set({ session: data.session, user: data.user });



      let warning: string | undefined;

      if (data.user) {

        try {

          await applyProfileRole(data.user.id);

          warning = await syncAfterAuth(data.user.id);

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



      const { data, error } = await getSupabase().auth.signUp({

        email: email.trim(),

        password,

        options: { data: meta },

      });

      if (error) return { ok: false, reason: translateAuthError(error.message) };

      if (!data.session) {

        return {

          ok: false,

          reason:

            'Conta criada! Abra o e-mail do Supabase (verifique spam), clique no link de confirmação e depois use Entrar com a mesma senha.',

        };

      }



      bindOrganizerToAuth(data.user);

      set({ session: data.session, user: data.user });

      return { ok: true };

    } finally {

      set({ loading: false });

    }

  },



  signOut: async () => {

    if (isSupabaseConfigured()) {

      await getSupabase().auth.signOut();

    }

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
        redirectTo: 'apphyrox://auth',
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

