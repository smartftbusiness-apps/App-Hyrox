import type { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';
import type { AppUserRole } from '@/src/domain/appRole';
import { getSupabase, isSupabaseConfigured } from '@/src/lib/supabase';
import { useAccessModeStore } from '@/src/stores/accessModeStore';
import { pullAndMergeFromSupabase } from '@/src/api/syncService';
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

  const dbRole = data?.role as string | undefined;
  if (dbRole === 'viewer' || dbRole === 'organizer' || dbRole === 'staff') {
    useAccessModeStore.getState().setAppRole(dbRole === 'viewer' ? 'viewer' : 'organizer');
    return;
  }
  useAccessModeStore.getState().setAppRole(roleFromMeta);
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

    if (session?.user) {
      await applyProfileRole(session.user.id).catch(() => undefined);
      if (useAccessModeStore.getState().isOrganizer()) {
        await pullAndMergeFromSupabase(session.user.id).catch(() => undefined);
      }
    }
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
          if (useAccessModeStore.getState().isOrganizer()) {
            await pullAndMergeFromSupabase(data.user.id);
          }
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
      const meta: Record<string, string> = { role };
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
    set({ session: null, user: null });
  },
}));

export async function hydrateAuthStore(): Promise<void> {
  await useAuthStore.getState().hydrate();
}

export function useIsAuthenticated(): boolean {
  return useAuthStore((s) => !!s.user);
}
