import { getSupabase, isSupabaseConfigured } from '@/src/lib/supabase';
import type { EventStaffMember } from '@/src/stores/eventStaffStore';
import type { RepositoryResult } from '@/src/api/repositoryTypes';

type DbStaffListRow = {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
};

export async function fetchStaffForEvent(eventSupabaseId: string): Promise<EventStaffMember[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await getSupabase().rpc('list_event_staff', {
    p_event_id: eventSupabaseId,
  });

  if (error) {
    const { data: fallback, error: fallbackError } = await getSupabase()
      .from('event_staff')
      .select('id, user_id')
      .eq('event_id', eventSupabaseId);

    if (fallbackError || !fallback) return [];

    return fallback.map((row) => ({
      id: row.id as string,
      userId: row.user_id as string,
      email: '',
      fullName: null,
    }));
  }

  return (data as DbStaffListRow[]).map((row) => ({
    id: row.id,
    userId: row.user_id,
    email: row.email ?? '',
    fullName: row.full_name,
  }));
}

export async function addEventStaffByEmail(
  eventSupabaseId: string,
  email: string,
): Promise<RepositoryResult<string>> {
  if (!isSupabaseConfigured()) {
    return { ok: false, reason: 'Supabase não configurado' };
  }

  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return { ok: false, reason: 'Informe o e-mail do juiz' };

  const { data: userId, error: lookupError } = await getSupabase().rpc(
    'lookup_profile_id_by_email',
    { p_email: trimmed },
  );

  if (lookupError) {
    const msg = lookupError.message.toLowerCase();
    if (msg.includes('function') && msg.includes('does not exist')) {
      return {
        ok: false,
        reason:
          'Função lookup_profile_id_by_email não existe. Rode as migrations 004 e 005 no Supabase.',
      };
    }
    return { ok: false, reason: lookupError.message };
  }

  if (!userId) {
    return {
      ok: false,
      reason:
        'Nenhuma conta com este e-mail. O juiz precisa criar conta no app (perfil Juiz) e confirmar o e-mail antes.',
    };
  }

  const { data, error } = await getSupabase()
    .from('event_staff')
    .insert({ event_id: eventSupabaseId, user_id: userId })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      return { ok: false, reason: 'Este juiz já está designado para o evento.' };
    }
    if (error.code === '42501') {
      return { ok: false, reason: 'Sem permissão. Sincronize o evento e entre como organizador.' };
    }
    return { ok: false, reason: error.message };
  }

  return { ok: true, data: data.id as string };
}

export async function removeEventStaff(staffRowId: string): Promise<RepositoryResult<void>> {
  if (!isSupabaseConfigured()) {
    return { ok: false, reason: 'Supabase não configurado' };
  }

  const { error } = await getSupabase().from('event_staff').delete().eq('id', staffRowId);
  if (error) return { ok: false, reason: error.message };
  return { ok: true, data: undefined };
}
