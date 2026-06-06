import { create } from 'zustand';
import { getSupabase, isSupabaseConfigured } from '@/src/lib/supabase';

export type CloudStatus = 'unknown' | 'not_configured' | 'online' | 'offline';

type CloudStatusState = {
  status: CloudStatus;
  lastCheckedAt: number | null;
  lastError: string | null;
  checkCloud: () => Promise<CloudStatus>;
};

function isNetworkFailure(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('failed to fetch') ||
    lower.includes('network request failed') ||
    lower.includes('network error') ||
    lower.includes('fetch failed')
  );
}

export const useCloudStatusStore = create<CloudStatusState>()((set) => ({
  status: 'unknown',
  lastCheckedAt: null,
  lastError: null,

  checkCloud: async () => {
    if (!isSupabaseConfigured()) {
      set({
        status: 'not_configured',
        lastCheckedAt: Date.now(),
        lastError: 'Supabase não configurado neste build',
      });
      return 'not_configured';
    }

    try {
      const { error } = await getSupabase().from('events').select('id').limit(1);
      if (error) {
        // Resposta do Supabase = nuvem online (erro pode ser RLS, tabela vazia, etc.)
        if (isNetworkFailure(error.message)) {
          set({
            status: 'offline',
            lastCheckedAt: Date.now(),
            lastError: error.message,
          });
          return 'offline';
        }
        set({ status: 'online', lastCheckedAt: Date.now(), lastError: null });
        return 'online';
      }
      set({ status: 'online', lastCheckedAt: Date.now(), lastError: null });
      return 'online';
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sem conexão com a nuvem';
      set({
        status: isNetworkFailure(message) ? 'offline' : 'online',
        lastCheckedAt: Date.now(),
        lastError: message,
      });
      return isNetworkFailure(message) ? 'offline' : 'online';
    }
  },
}));

export const CLOUD_STATUS_LABELS: Record<CloudStatus, string> = {
  unknown: 'Verificando…',
  not_configured: 'Nuvem não configurada',
  online: 'Nuvem online',
  offline: 'Nuvem indisponível',
};
