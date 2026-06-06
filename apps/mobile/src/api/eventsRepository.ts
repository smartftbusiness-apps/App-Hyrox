import type { EventStatus, HyroxEvent } from '@/src/domain/types';
import { getSupabase, isSupabaseConfigured } from '@/src/lib/supabase';
import type { RepositoryResult } from '@/src/api/repositoryTypes';
import { isUuid, resolveDbId } from '@/src/api/repositoryTypes';
import { HYROX_TEMPLATE_ID } from '@/src/api/segmentTemplate';

async function requireAuthUserId(): Promise<RepositoryResult<string>> {
  const { data, error } = await getSupabase().auth.getUser();
  if (error) return { ok: false, reason: error.message };
  if (!data.user) {
    return {
      ok: false,
      reason: 'Sessão Supabase ausente. Faça login para sincronizar com o banco.',
    };
  }
  return { ok: true, data: data.user.id };
}

function resolveDbEventId(event: HyroxEvent): string | null {
  return resolveDbId(event);
}

export async function ensureEventInSupabase(event: HyroxEvent): Promise<RepositoryResult<string>> {
  if (!isSupabaseConfigured()) return { ok: true, data: resolveDbEventId(event) ?? undefined };

  const existingId = resolveDbEventId(event);
  if (existingId) return { ok: true, data: existingId };

  const auth = await requireAuthUserId();
  if (!auth.ok) return auth;

  const { data, error } = await getSupabase()
    .from('events')
    .insert({
      organizer_id: auth.data,
      name: event.name,
      event_date: event.date,
      location: event.location,
      status: event.status,
      course_template_id: HYROX_TEMPLATE_ID,
    })
    .select('id')
    .single();

  if (error) return { ok: false, reason: error.message };
  return { ok: true, data: data.id };
}

export async function createEventInSupabase(
  event: HyroxEvent,
): Promise<RepositoryResult<string>> {
  return ensureEventInSupabase(event);
}

export async function updateEventStatusInSupabase(
  event: HyroxEvent,
  status: EventStatus,
): Promise<RepositoryResult<string>> {
  if (!isSupabaseConfigured()) return { ok: true };

  const ensured = await ensureEventInSupabase(event);
  if (!ensured.ok) return ensured;

  const dbId = ensured.data!;
  const { error } = await getSupabase()
    .from('events')
    .update({ status })
    .eq('id', dbId);

  if (error) return { ok: false, reason: error.message };
  return { ok: true, data: dbId };
}

export async function finishEventInSupabase(event: HyroxEvent): Promise<RepositoryResult<string>> {
  return updateEventStatusInSupabase(event, 'finished');
}

export async function deleteEventInSupabase(event: HyroxEvent): Promise<RepositoryResult<void>> {
  if (!isSupabaseConfigured()) return { ok: true, data: undefined };

  const dbId = resolveDbEventId(event);
  if (!dbId) return { ok: true, data: undefined };

  const { error } = await getSupabase().from('events').delete().eq('id', dbId);
  if (error) return { ok: false, reason: error.message };
  return { ok: true, data: undefined };
}

export { isUuid };
