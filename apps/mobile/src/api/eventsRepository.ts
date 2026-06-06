import type { EventStatus, HyroxEvent } from '@/src/domain/types';
import { getSupabase, isSupabaseConfigured } from '@/src/lib/supabase';

const HYROX_TEMPLATE_ID = '00000000-0000-0000-0000-000000000001';

export type RepositoryResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; reason: string };

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function resolveDbEventId(event: HyroxEvent): string | null {
  if (event.supabaseId && isUuid(event.supabaseId)) return event.supabaseId;
  if (isUuid(event.id)) return event.id;
  return null;
}

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
