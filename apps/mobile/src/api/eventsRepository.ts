import type { EventStatus, HyroxEvent } from '@/src/domain/types';
import type { SharedRaceClock } from '@/src/utils/raceClock';
import { emptyRaceClock } from '@/src/utils/raceClock';
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

/** Grava o relógio compartilhado da bateria (start, pausa e acumulado). */
export async function persistEventRaceClock(
  event: HyroxEvent,
  clock: SharedRaceClock,
): Promise<RepositoryResult<string>> {
  if (!isSupabaseConfigured()) return { ok: true };

  const ensured = await ensureEventInSupabase(event);
  if (!ensured.ok) return ensured;

  const payload = {
    race_started_at: clock.startedAt,
    race_paused_at: clock.pausedAt,
    race_pause_accum_ms: clock.pauseAccumMs,
  };

  const full = await getSupabase().from('events').update(payload).eq('id', ensured.data!);
  if (!full.error) return { ok: true, data: ensured.data! };

  const { error } = await getSupabase()
    .from('events')
    .update({ race_started_at: clock.startedAt })
    .eq('id', ensured.data!);
  if (error) return { ok: false, reason: error.message };
  if (clock.pausedAt || clock.pauseAccumMs > 0) {
    return { ok: false, reason: full.error.message };
  }
  return { ok: true, data: ensured.data! };
}

/** Grava o start da bateria para juízes verem o tempo total em tempo real. */
export async function setEventRaceStartedAtInSupabase(
  event: HyroxEvent,
  startedAtIso: string,
): Promise<RepositoryResult<string>> {
  return persistEventRaceClock(event, {
    startedAt: startedAtIso,
    pausedAt: null,
    pauseAccumMs: 0,
  });
}

export async function fetchEventRaceClock(eventDbId: string): Promise<SharedRaceClock> {
  if (!isSupabaseConfigured()) return emptyRaceClock();

  const full = await getSupabase()
    .from('events')
    .select('race_started_at, race_paused_at, race_pause_accum_ms')
    .eq('id', eventDbId)
    .maybeSingle();

  if (!full.error && full.data) {
    return {
      startedAt: (full.data.race_started_at as string | null) ?? null,
      pausedAt: (full.data.race_paused_at as string | null) ?? null,
      pauseAccumMs: Number(full.data.race_pause_accum_ms ?? 0),
    };
  }

  const fallback = await getSupabase()
    .from('events')
    .select('race_started_at')
    .eq('id', eventDbId)
    .maybeSingle();
  if (fallback.error || !fallback.data) return emptyRaceClock();
  return {
    startedAt: (fallback.data.race_started_at as string | null) ?? null,
    pausedAt: null,
    pauseAccumMs: 0,
  };
}

export async function fetchEventRaceStartedAt(eventDbId: string): Promise<string | null> {
  const clock = await fetchEventRaceClock(eventDbId);
  return clock.startedAt;
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
