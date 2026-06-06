import { getSupabase, isSupabaseConfigured } from '@/src/lib/supabase';
import type { EventStaffMember } from '@/src/stores/eventStaffStore';
import type { RepositoryResult } from '@/src/api/repositoryTypes';

type DbStaffRow = {
  id: string;
  event_id: string;
  user_id: string;
  profiles: { full_name: string | null } | null;
};

export async function fetchStaffForEvent(eventSupabaseId: string): Promise<EventStaffMember[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await getSupabase()
    .from('event_staff')
    .select('id, event_id, user_id, profiles(full_name)')
    .eq('event_id', eventSupabaseId);

  if (error || !data) return [];

  return (data as unknown as DbStaffRow[]).map((row) => ({
    id: row.id,
    userId: row.user_id,
    email: '',
    fullName: row.profiles?.full_name ?? null,
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
    return {
      ok: false,
      reason:
        'Não foi possível buscar o usuário. Rode a migration 004 no Supabase (lookup_profile_id_by_email).',
    };
  }
  if (!userId) {
    return {
      ok: false,
      reason: 'Nenhuma conta com este e-mail. Peça para o juiz criar conta antes.',
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
