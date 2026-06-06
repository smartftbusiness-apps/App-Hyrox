import type { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';
import { getSupabase, isSupabaseConfigured } from '@/src/lib/supabase';
import { pullAndMergeFromSupabase } from '@/src/api/syncService';
import { useOrganizerStore } from '@/src/stores/organizerStore';

export type AuthActionResult = { ok: true } | { ok: false; reason: string };

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  hydrated: boolean;
  signIn: (email: string, password: string) => Promise<AuthActionResult>;
  signUp: (email: string, password: string, fullName?: string) => Promise<AuthActionResult>;
  signOut: () => Promise<void>;
  hydrate: () => Promise<void>;
};

function bindOrganizerToAuth(user: User | null): void {
  if (user?.id) {
    useOrganizerStore.setState({ organizerId: user.id });
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

    if (session?.user) {
      await pullAndMergeFromSupabase(session.user.id).catch(() => undefined);
    }
  },

  signIn: async (email, password) => {
    if (!isSupabaseConfigured()) {
      return { ok: false, reason: 'Supabase não configurado' };
    }
    set({ loading: true });
    try {
      const { data, error } = await getSupabase().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) return { ok: false, reason: error.message };

      bindOrganizerToAuth(data.user);
      set({ session: data.session, user: data.user });
      if (data.user) {
        await pullAndMergeFromSupabase(data.user.id);
      }
      return { ok: true };
    } finally {
      set({ loading: false });
    }
  },

  signUp: async (email, password, fullName) => {
    if (!isSupabaseConfigured()) {
      return { ok: false, reason: 'Supabase não configurado' };
    }
    set({ loading: true });
    try {
      const { data, error } = await getSupabase().auth.signUp({
        email: email.trim(),
        password,
        options: fullName?.trim()
          ? { data: { full_name: fullName.trim() } }
          : undefined,
      });
      if (error) return { ok: false, reason: error.message };
      if (!data.session) {
        return {
          ok: false,
          reason: 'Conta criada. Confirme o e-mail no Supabase (se exigido) e faça login.',
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
