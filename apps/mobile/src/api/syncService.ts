import type {
  Athlete,
  AthleteStatus,
  Category,
  Division,
  DoublesPair,
  Gender,
  HyroxEvent,
  SegmentTime,
} from '@/src/domain/types';
import { cloneHyroxSegments } from '@/src/domain/hyroxTemplate';
import { getSupabase, isSupabaseConfigured } from '@/src/lib/supabase';
import {
  ensureEventInSupabase,
  updateEventStatusInSupabase,
} from '@/src/api/eventsRepository';
import type { RepositoryResult } from '@/src/api/repositoryTypes';
import { dbIdFromLocalId, isUuid, localIdFromDb, resolveDbId } from '@/src/api/repositoryTypes';
import { getTemplateSegmentIdByOrder } from '@/src/api/segmentTemplate';
import { useAthletesStore } from '@/src/stores/athletesStore';
import { useCloudStatusStore } from '@/src/stores/cloudStatusStore';
import { useEventsStore } from '@/src/stores/eventsStore';

type DbEvent = {
  id: string;
  organizer_id: string;
  name: string;
  event_date: string;
  location: string;
  status: HyroxEvent['status'];
};

type DbCategory = {
  id: string;
  event_id: string;
  name: string;
  division: Division;
  gender: Gender;
};

type DbAthlete = {
  id: string;
  event_id: string;
  category_id: string | null;
  name: string;
  bib_number: number;
  pair_id: string | null;
  status: AthleteStatus;
};

type DbPair = {
  id: string;
  event_id: string;
  category_id: string;
  bib_number: number;
  athlete1_id: string;
  athlete2_id: string;
  team_name: string | null;
  status: AthleteStatus;
};

type DbAthleteRun = {
  id: string;
  athlete_id: string;
  event_id: string;
  total_ms: number | null;
  status: string;
};

type DbPairRun = {
  id: string;
  pair_id: string;
  event_id: string;
  total_ms: number | null;
  status: string;
};

type DbSegmentTime = {
  athlete_run_id: string;
  segment_id: string;
  duration_ms: number;
};

type DbPairSegmentTime = {
  pair_run_id: string;
  segment_id: string;
  duration_ms: number;
};

const syncTimers = new Map<string, ReturnType<typeof setTimeout>>();

function mapDbEvent(row: DbEvent): HyroxEvent {
  const localId = localIdFromDb('evt', row.id);
  return {
    id: localId,
    supabaseId: row.id,
    organizerId: row.organizer_id,
    name: row.name,
    date: row.event_date,
    location: row.location,
    status: row.status,
    athleteCount: 0,
    categories: [],
    segments: cloneHyroxSegments(localId),
  };
}

function mapDbCategory(row: DbCategory, localEventId: string): Category {
  return {
    id: localIdFromDb('cat', row.id),
    supabaseId: row.id,
    name: row.name,
    division: row.division,
    gender: row.gender,
  };
}

function segmentTimesFromDb(
  runs: DbAthleteRun[] | DbPairRun[],
  segmentTimes: DbSegmentTime[] | DbPairSegmentTime[],
  participantDbId: string,
  localEventId: string,
  isPair: boolean,
): SegmentTime[] {
  const run = runs.find((r) =>
    isPair ? (r as DbPairRun).pair_id === participantDbId : (r as DbAthleteRun).athlete_id === participantDbId,
  );
  if (!run) return [];

  const times = isPair
    ? (segmentTimes as DbPairSegmentTime[]).filter((st) => st.pair_run_id === run.id)
    : (segmentTimes as DbSegmentTime[]).filter((st) => st.athlete_run_id === run.id);

  return times.map((st, idx) => ({
    segmentId: `${localEventId}-seg-${String(idx + 1).padStart(2, '0')}`,
    durationMs: st.duration_ms,
  }));
}

async function loadBundleFromDbEvents(
  eventRows: DbEvent[],
): Promise<{ events: HyroxEvent[]; athletes: Athlete[]; pairs: DoublesPair[] }> {
  if (!eventRows.length) {
    return { events: [], athletes: [], pairs: [] };
  }

  const dbEventIds = eventRows.map((e) => e.id);
  const events: HyroxEvent[] = (eventRows as DbEvent[]).map(mapDbEvent);
  const eventIdByDb = new Map(events.map((e) => [e.supabaseId!, e.id]));

  const [catRes, athRes, pairRes, runRes, pairRunRes] = await Promise.all([
    getSupabase().from('categories').select('*').in('event_id', dbEventIds),
    getSupabase().from('athletes').select('*').in('event_id', dbEventIds),
    getSupabase().from('doubles_pairs').select('*').in('event_id', dbEventIds),
    getSupabase().from('athlete_runs').select('*').in('event_id', dbEventIds),
    getSupabase().from('pair_runs').select('*').in('event_id', dbEventIds),
  ]);

  const categories = (catRes.data ?? []) as DbCategory[];
  const athletesDb = (athRes.data ?? []) as DbAthlete[];
  const pairsDb = (pairRes.data ?? []) as DbPair[];
  const athleteRuns = (runRes.data ?? []) as DbAthleteRun[];
  const pairRuns = (pairRunRes.data ?? []) as DbPairRun[];

  let segmentTimes: DbSegmentTime[] = [];
  let pairSegmentTimes: DbPairSegmentTime[] = [];

  if (athleteRuns.length) {
    const { data } = await getSupabase()
      .from('segment_times')
      .select('athlete_run_id, segment_id, duration_ms')
      .in(
        'athlete_run_id',
        athleteRuns.map((r) => r.id),
      );
    segmentTimes = (data ?? []) as DbSegmentTime[];
  }

  if (pairRuns.length) {
    const { data } = await getSupabase()
      .from('pair_segment_times')
      .select('pair_run_id, segment_id, duration_ms')
      .in(
        'pair_run_id',
        pairRuns.map((r) => r.id),
      );
    pairSegmentTimes = (data ?? []) as DbPairSegmentTime[];
  }

  const catLocalByDb = new Map<string, string>();
  for (const row of categories) {
    const localEventId = eventIdByDb.get(row.event_id);
    if (!localEventId) continue;
    const cat = mapDbCategory(row, localEventId);
    catLocalByDb.set(row.id, cat.id);
    const event = events.find((e) => e.id === localEventId);
    if (event) event.categories.push(cat);
  }

  const pairLocalByDb = new Map<string, string>();
  const athletes: Athlete[] = athletesDb.map((row) => {
    const localEventId = eventIdByDb.get(row.event_id)!;
    const localAthleteId = localIdFromDb('ath', row.id);
    const pairLocalId = row.pair_id ? localIdFromDb('pair', row.pair_id) : null;
    if (row.pair_id) pairLocalByDb.set(row.pair_id, pairLocalId!);

    const run = athleteRuns.find((r) => r.athlete_id === row.id);
    return {
      id: localAthleteId,
      supabaseId: row.id,
      eventId: localEventId,
      name: row.name,
      bib: row.bib_number,
      categoryId: row.category_id ? catLocalByDb.get(row.category_id) ?? '' : '',
      pairId: pairLocalId,
      status: row.status,
      totalMs: run?.total_ms ?? null,
      segmentTimes: segmentTimesFromDb(athleteRuns, segmentTimes, row.id, localEventId, false),
    };
  });

  const pairs: DoublesPair[] = pairsDb.map((row) => {
    const localEventId = eventIdByDb.get(row.event_id)!;
    const localPairId = localIdFromDb('pair', row.id);
    pairLocalByDb.set(row.id, localPairId);
    const run = pairRuns.find((r) => r.pair_id === row.id);
    return {
      id: localPairId,
      supabaseId: row.id,
      eventId: localEventId,
      categoryId: catLocalByDb.get(row.category_id) ?? '',
      bib: row.bib_number,
      athlete1Id: localIdFromDb('ath', row.athlete1_id),
      athlete2Id: localIdFromDb('ath', row.athlete2_id),
      teamName: row.team_name ?? undefined,
      status: row.status,
      totalMs: run?.total_ms ?? null,
      segmentTimes: segmentTimesFromDb(pairRuns, pairSegmentTimes, row.id, localEventId, true),
    };
  });

  for (const event of events) {
    event.athleteCount = athletes.filter((a) => a.eventId === event.id).length;
  }

  return { events, athletes, pairs };
}

export async function pullOrganizerDataFromSupabase(
  organizerId: string,
): Promise<{ events: HyroxEvent[]; athletes: Athlete[]; pairs: DoublesPair[] } | null> {
  if (!isSupabaseConfigured()) return null;

  const { data: eventRows, error: eventsError } = await getSupabase()
    .from('events')
    .select('id, organizer_id, name, event_date, location, status')
    .eq('organizer_id', organizerId)
    .order('event_date', { ascending: false });

  if (eventsError) {
    throw new Error(eventsError.message);
  }

  return loadBundleFromDbEvents((eventRows ?? []) as DbEvent[]);
}

/** Eventos públicos: inscrições abertas, ao vivo ou encerrados (RLS permite leitura) */
export async function pullPublicEventsFromSupabase(): Promise<{
  events: HyroxEvent[];
  athletes: Athlete[];
  pairs: DoublesPair[];
}> {
  if (!isSupabaseConfigured()) {
    return { events: [], athletes: [], pairs: [] };
  }

  const { data: eventRows, error } = await getSupabase()
    .from('events')
    .select('id, organizer_id, name, event_date, location, status')
    .in('status', ['open', 'live', 'finished'])
    .order('event_date', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return loadBundleFromDbEvents((eventRows ?? []) as DbEvent[]);
}

export type PublicSyncResult =
  | { ok: true; eventCount: number }
  | { ok: false; reason: string };

export async function pullAndMergePublicEvents(): Promise<PublicSyncResult> {
  const cloud = await useCloudStatusStore.getState().checkCloud();
  if (cloud === 'not_configured') {
    return { ok: false, reason: 'Este app não está configurado para a nuvem.' };
  }
  if (cloud === 'offline') {
    return {
      ok: false,
      reason: 'Nuvem indisponível no momento. Tente de novo em alguns minutos.',
    };
  }

  try {
    const { events: dbEvents, athletes: dbAthletes, pairs: dbPairs } =
      await pullPublicEventsFromSupabase();

    const publicIds = new Set(dbEvents.map((e) => e.id));

    useEventsStore.setState((state) => {
      const kept = state.events.filter(
        (e) => !e.supabaseId && !publicIds.has(e.id) && e.status === 'draft',
      );
      const merged = dbEvents.map((remote) => {
        const existing = state.events.find(
          (e) => e.supabaseId === remote.supabaseId || e.id === remote.id,
        );
        return existing ? { ...remote, id: existing.id, segments: existing.segments } : remote;
      });
      return { events: [...merged, ...kept] };
    });

    const eventIds = new Set(useEventsStore.getState().events.map((e) => e.id));

    const events = useEventsStore.getState().events;
    const localDraftEventIds = new Set(
      events.filter((e) => e.status === 'draft' && !e.supabaseId).map((e) => e.id),
    );

    useAthletesStore.setState((state) => ({
      athletes: [
        ...dbAthletes.filter((a) => eventIds.has(a.eventId)),
        ...state.athletes.filter((a) => localDraftEventIds.has(a.eventId)),
      ],
      pairs: [
        ...dbPairs.filter((p) => eventIds.has(p.eventId)),
        ...state.pairs.filter((p) => localDraftEventIds.has(p.eventId)),
      ],
    }));

    return { ok: true, eventCount: dbEvents.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao buscar eventos';
    return { ok: false, reason: message };
  }
}

export async function pullAndMergeFromSupabase(organizerId: string): Promise<void> {
  const pulled = await pullOrganizerDataFromSupabase(organizerId);
  if (!pulled) return;

  const { events: dbEvents, athletes: dbAthletes, pairs: dbPairs } = pulled;
  useEventsStore.setState((state) => {
    const localOnly = state.events.filter(
      (e) =>
        !e.supabaseId &&
        !dbIdFromLocalId(e.id) &&
        e.organizerId === organizerId,
    );
    const mergedRemote = dbEvents.map((remote) => {
      const existing = state.events.find(
        (e) => e.supabaseId === remote.supabaseId || e.id === remote.id,
      );
      return existing
        ? { ...remote, id: existing.id, segments: existing.segments }
        : remote;
    });
    return { events: [...mergedRemote, ...localOnly] };
  });

  const events = useEventsStore.getState().events;
  const eventIds = new Set(events.map((e) => e.id));
  const localOnlyEventIds = new Set(
    events.filter((e) => !e.supabaseId).map((e) => e.id),
  );

  useAthletesStore.setState((state) => ({
    athletes: [
      ...dbAthletes.filter((a) => eventIds.has(a.eventId)),
      ...state.athletes.filter((a) => localOnlyEventIds.has(a.eventId)),
    ],
    pairs: [
      ...dbPairs.filter((p) => eventIds.has(p.eventId)),
      ...state.pairs.filter((p) => localOnlyEventIds.has(p.eventId)),
    ],
  }));
}

async function syncCategories(
  event: HyroxEvent,
  dbEventId: string,
): Promise<Map<string, string>> {
  const localToDb = new Map<string, string>();

  for (const cat of event.categories) {
    const existingDbId = resolveDbId(cat);
    if (existingDbId) {
      localToDb.set(cat.id, existingDbId);
      await getSupabase()
        .from('categories')
        .update({ name: cat.name, division: cat.division, gender: cat.gender })
        .eq('id', existingDbId);
      continue;
    }

    const { data, error } = await getSupabase()
      .from('categories')
      .insert({
        event_id: dbEventId,
        name: cat.name,
        division: cat.division,
        gender: cat.gender,
      })
      .select('id')
      .single();

    if (!error && data) {
      localToDb.set(cat.id, data.id);
      useEventsStore.setState((state) => ({
        events: state.events.map((e) =>
          e.id === event.id
            ? {
                ...e,
                categories: e.categories.map((c) =>
                  c.id === cat.id ? { ...c, supabaseId: data.id } : c,
                ),
              }
            : e,
        ),
      }));
    }
  }

  return localToDb;
}

async function syncAthletesForEvent(
  event: HyroxEvent,
  dbEventId: string,
  categoryMap: Map<string, string>,
): Promise<Map<string, string>> {
  const { athletes } = useAthletesStore.getState();
  const eventAthletes = athletes.filter((a) => a.eventId === event.id);
  const localToDb = new Map<string, string>();

  for (const athlete of eventAthletes) {
    const dbCatId = categoryMap.get(athlete.categoryId);
    const existingDbId = resolveDbId(athlete);

    const payload = {
      event_id: dbEventId,
      category_id: dbCatId ?? null,
      name: athlete.name,
      bib_number: athlete.bib,
      status: athlete.status,
      pair_id: null as string | null,
    };

    if (existingDbId) {
      await getSupabase().from('athletes').update(payload).eq('id', existingDbId);
      localToDb.set(athlete.id, existingDbId);
    } else {
      const { data, error } = await getSupabase()
        .from('athletes')
        .insert(payload)
        .select('id')
        .single();
      if (!error && data) {
        localToDb.set(athlete.id, data.id);
        useAthletesStore.setState((state) => ({
          athletes: state.athletes.map((a) =>
            a.id === athlete.id ? { ...a, supabaseId: data.id } : a,
          ),
        }));
      }
    }
  }

  return localToDb;
}

async function syncPairsForEvent(
  event: HyroxEvent,
  dbEventId: string,
  categoryMap: Map<string, string>,
  athleteMap: Map<string, string>,
): Promise<Map<string, string>> {
  const { pairs } = useAthletesStore.getState();
  const eventPairs = pairs.filter((p) => p.eventId === event.id);
  const localToDb = new Map<string, string>();

  for (const pair of eventPairs) {
    const a1 = athleteMap.get(pair.athlete1Id);
    const a2 = athleteMap.get(pair.athlete2Id);
    const dbCatId = categoryMap.get(pair.categoryId);
    if (!a1 || !a2 || !dbCatId) continue;

    const existingDbId = resolveDbId(pair);
    const payload = {
      event_id: dbEventId,
      category_id: dbCatId,
      bib_number: pair.bib,
      athlete1_id: a1,
      athlete2_id: a2,
      team_name: pair.teamName ?? null,
      status: pair.status,
    };

    let pairDbId = existingDbId;

    if (existingDbId) {
      await getSupabase().from('doubles_pairs').update(payload).eq('id', existingDbId);
    } else {
      const { data, error } = await getSupabase()
        .from('doubles_pairs')
        .insert(payload)
        .select('id')
        .single();
      if (error || !data) continue;
      pairDbId = data.id;
      useAthletesStore.setState((state) => ({
        pairs: state.pairs.map((p) =>
          p.id === pair.id ? { ...p, supabaseId: data.id } : p,
        ),
      }));
    }

    if (pairDbId) {
      localToDb.set(pair.id, pairDbId);
      await getSupabase()
        .from('athletes')
        .update({ pair_id: pairDbId, bib_number: pair.bib })
        .in('id', [a1, a2]);
    }
  }

  return localToDb;
}

async function syncTimingForEvent(
  event: HyroxEvent,
  dbEventId: string,
  athleteMap: Map<string, string>,
  pairMap: Map<string, string>,
): Promise<void> {
  const { athletes, pairs } = useAthletesStore.getState();

  for (const athlete of athletes.filter((a) => a.eventId === event.id && !a.pairId)) {
    if (athlete.status !== 'finished' || athlete.totalMs == null) continue;
    const dbAthleteId = athleteMap.get(athlete.id) ?? resolveDbId(athlete);
    if (!dbAthleteId) continue;

    const { data: existingRun } = await getSupabase()
      .from('athlete_runs')
      .select('id')
      .eq('athlete_id', dbAthleteId)
      .maybeSingle();

    let runId = existingRun?.id;
    if (!runId) {
      const { data } = await getSupabase()
        .from('athlete_runs')
        .insert({
          athlete_id: dbAthleteId,
          event_id: dbEventId,
          total_ms: athlete.totalMs,
          status: 'finished',
          finished_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      runId = data?.id;
    } else {
      await getSupabase()
        .from('athlete_runs')
        .update({
          total_ms: athlete.totalMs,
          status: 'finished',
          finished_at: new Date().toISOString(),
        })
        .eq('id', runId);
    }

    if (!runId || !athlete.segmentTimes?.length) continue;

    for (let i = 0; i < athlete.segmentTimes.length; i++) {
      const st = athlete.segmentTimes[i];
      const order = event.segments.find((s) => s.id === st.segmentId)?.order ?? i + 1;
      const segmentDbId = await getTemplateSegmentIdByOrder(order);
      if (!segmentDbId) continue;

      await getSupabase().from('segment_times').upsert(
        {
          athlete_run_id: runId,
          segment_id: segmentDbId,
          duration_ms: st.durationMs,
        },
        { onConflict: 'athlete_run_id,segment_id' },
      );
    }
  }

  for (const pair of pairs.filter((p) => p.eventId === event.id)) {
    if (pair.status !== 'finished' || pair.totalMs == null) continue;
    const dbPairId = pairMap.get(pair.id) ?? resolveDbId(pair);
    if (!dbPairId) continue;

    const { data: existingRun } = await getSupabase()
      .from('pair_runs')
      .select('id')
      .eq('pair_id', dbPairId)
      .maybeSingle();

    let runId = existingRun?.id;
    if (!runId) {
      const { data } = await getSupabase()
        .from('pair_runs')
        .insert({
          pair_id: dbPairId,
          event_id: dbEventId,
          total_ms: pair.totalMs,
          status: 'finished',
          finished_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      runId = data?.id;
    } else {
      await getSupabase()
        .from('pair_runs')
        .update({
          total_ms: pair.totalMs,
          status: 'finished',
          finished_at: new Date().toISOString(),
        })
        .eq('id', runId);
    }

    if (!runId || !pair.segmentTimes?.length) continue;

    for (let i = 0; i < pair.segmentTimes.length; i++) {
      const st = pair.segmentTimes[i];
      const order = event.segments.find((s) => s.id === st.segmentId)?.order ?? i + 1;
      const segmentDbId = await getTemplateSegmentIdByOrder(order);
      if (!segmentDbId) continue;

      await getSupabase().from('pair_segment_times').upsert(
        {
          pair_run_id: runId,
          segment_id: segmentDbId,
          duration_ms: st.durationMs,
        },
        { onConflict: 'pair_run_id,segment_id' },
      );
    }
  }
}

export async function pushEventToSupabase(eventId: string): Promise<RepositoryResult<string>> {
  if (!isSupabaseConfigured()) return { ok: true };

  const event = useEventsStore.getState().events.find((e) => e.id === eventId);
  if (!event) return { ok: false, reason: 'Evento não encontrado' };

  const ensured = await ensureEventInSupabase(event);
  if (!ensured.ok) return ensured;
  const dbEventId = ensured.data!;

  if (event.supabaseId !== dbEventId) {
    useEventsStore.setState((state) => ({
      events: state.events.map((e) =>
        e.id === eventId ? { ...e, supabaseId: dbEventId } : e,
      ),
    }));
  }

  await getSupabase()
    .from('events')
    .update({
      name: event.name,
      location: event.location,
      event_date: event.date,
      status: event.status,
    })
    .eq('id', dbEventId);

  const categoryMap = await syncCategories(event, dbEventId);
  const athleteMap = await syncAthletesForEvent(event, dbEventId, categoryMap);
  const pairMap = await syncPairsForEvent(event, dbEventId, categoryMap, athleteMap);
  await syncTimingForEvent(event, dbEventId, athleteMap, pairMap);

  return { ok: true, data: dbEventId };
}

export function scheduleEventSync(eventId: string, delayMs = 600): void {
  if (!isSupabaseConfigured()) return;
  const existing = syncTimers.get(eventId);
  if (existing) clearTimeout(existing);
  syncTimers.set(
    eventId,
    setTimeout(() => {
      syncTimers.delete(eventId);
      void pushEventToSupabase(eventId);
    }, delayMs),
  );
}

export async function syncEventStatusToSupabase(
  eventId: string,
  status: HyroxEvent['status'],
): Promise<RepositoryResult<string>> {
  const event = useEventsStore.getState().events.find((e) => e.id === eventId);
  if (!event) return { ok: false, reason: 'Evento não encontrado' };
  return updateEventStatusInSupabase({ ...event, status }, status);
}
