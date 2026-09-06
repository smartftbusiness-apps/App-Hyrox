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
import { useEventStaffStore } from '@/src/stores/eventStaffStore';
import { useEventsStore } from '@/src/stores/eventsStore';
import { fetchAndApplyLiveRuns } from '@/src/api/liveTimingRepository';
import { fetchMyJudgeAssignments } from '@/src/api/staffRepository';
import { dedupeEvents } from '@/src/utils/dedupeEvents';
import { stationSegmentOptions } from '@/src/utils/stationTiming';

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
  started_at: string | null;
  total_ms: number | null;
  status: string;
};

type DbPairRun = {
  id: string;
  pair_id: string;
  event_id: string;
  started_at: string | null;
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

function mergeEventsLocalRemote(remote: HyroxEvent, existing: HyroxEvent): HyroxEvent {
  const categoryBySupabase = new Map(
    existing.categories.filter((c) => c.supabaseId).map((c) => [c.supabaseId!, c]),
  );
  const mergedCategories = remote.categories.map((rc) => {
    const match = rc.supabaseId ? categoryBySupabase.get(rc.supabaseId) : undefined;
    return match ? { ...rc, id: match.id } : rc;
  });

  return {
    ...remote,
    id: existing.id,
    segments: existing.segments.length > 0 ? existing.segments : remote.segments,
    heats: existing.heats?.length ? existing.heats : remote.heats,
    categories: mergedCategories,
    status: remote.status,
    name: remote.name,
    date: remote.date,
    location: remote.location,
  };
}

function buildMergedEventLookup(mergedEvents: HyroxEvent[]): {
  eventIdRemap: Map<string, string>;
  categoryIdRemap: Map<string, string>;
} {
  const eventIdRemap = new Map<string, string>();
  const categoryIdRemap = new Map<string, string>();

  for (const event of mergedEvents) {
    if (event.supabaseId) {
      eventIdRemap.set(localIdFromDb('evt', event.supabaseId), event.id);
      eventIdRemap.set(event.supabaseId, event.id);
    }
    eventIdRemap.set(event.id, event.id);

    for (const cat of event.categories) {
      if (cat.supabaseId) {
        categoryIdRemap.set(localIdFromDb('cat', cat.supabaseId), cat.id);
        categoryIdRemap.set(cat.supabaseId, cat.id);
      }
      categoryIdRemap.set(cat.id, cat.id);
    }
  }

  return { eventIdRemap, categoryIdRemap };
}

function remapRemoteAthlete(
  athlete: Athlete,
  eventIdRemap: Map<string, string>,
  categoryIdRemap: Map<string, string>,
): Athlete {
  return {
    ...athlete,
    eventId: eventIdRemap.get(athlete.eventId) ?? athlete.eventId,
    categoryId: categoryIdRemap.get(athlete.categoryId) ?? athlete.categoryId,
  };
}

function remapRemotePair(
  pair: DoublesPair,
  eventIdRemap: Map<string, string>,
  categoryIdRemap: Map<string, string>,
  athleteIdRemap: Map<string, string>,
): DoublesPair {
  return {
    ...pair,
    eventId: eventIdRemap.get(pair.eventId) ?? pair.eventId,
    categoryId: categoryIdRemap.get(pair.categoryId) ?? pair.categoryId,
    athlete1Id: athleteIdRemap.get(pair.athlete1Id) ?? pair.athlete1Id,
    athlete2Id: athleteIdRemap.get(pair.athlete2Id) ?? pair.athlete2Id,
  };
}

function mergeAthletesAfterPull(
  localAthletes: Athlete[],
  remoteAthletes: Athlete[],
  mergedEvents: HyroxEvent[],
): Athlete[] {
  const { eventIdRemap, categoryIdRemap } = buildMergedEventLookup(mergedEvents);
  const remappedRemote = remoteAthletes.map((a) =>
    remapRemoteAthlete(a, eventIdRemap, categoryIdRemap),
  );

  const syncedEventIds = new Set(
    mergedEvents.filter((e) => e.supabaseId).map((e) => e.id),
  );
  const localOnlyEventIds = new Set(
    mergedEvents.filter((e) => !e.supabaseId).map((e) => e.id),
  );
  const pulledEventIds = new Set(mergedEvents.map((e) => e.id));

  const localBySupabaseId = new Map(
    localAthletes
      .filter((a) => resolveDbId(a))
      .map((a) => [resolveDbId(a)!, a]),
  );

  const mergedRemote = remappedRemote.map((remote) => {
    const dbId = resolveDbId(remote);
    const existing = dbId ? localBySupabaseId.get(dbId) : undefined;
    if (existing) {
      return { ...remote, id: existing.id, pairId: existing.pairId ?? remote.pairId };
    }
    return remote;
  });

  const remoteDbIds = new Set(
    mergedRemote.map((a) => resolveDbId(a)).filter((id): id is string => !!id),
  );

  const keptLocal = localAthletes.filter((a) => {
    if (!pulledEventIds.has(a.eventId)) return true;
    if (localOnlyEventIds.has(a.eventId)) return true;
    if (!syncedEventIds.has(a.eventId)) return true;
    if (!resolveDbId(a)) return true;
    return !remoteDbIds.has(resolveDbId(a)!);
  });

  const byId = new Map<string, Athlete>();
  for (const athlete of [...mergedRemote, ...keptLocal]) {
    byId.set(athlete.id, athlete);
  }
  return [...byId.values()];
}

function mergePairsAfterPull(
  localPairs: DoublesPair[],
  remotePairs: DoublesPair[],
  mergedEvents: HyroxEvent[],
  mergedAthletes: Athlete[],
): DoublesPair[] {
  const { eventIdRemap, categoryIdRemap } = buildMergedEventLookup(mergedEvents);

  const athleteIdRemap = new Map<string, string>();
  for (const athlete of mergedAthletes) {
    athleteIdRemap.set(athlete.id, athlete.id);
    if (athlete.supabaseId) {
      athleteIdRemap.set(localIdFromDb('ath', athlete.supabaseId), athlete.id);
      athleteIdRemap.set(athlete.supabaseId, athlete.id);
    }
  }

  const remappedRemote = remotePairs.map((p) =>
    remapRemotePair(p, eventIdRemap, categoryIdRemap, athleteIdRemap),
  );

  const syncedEventIds = new Set(
    mergedEvents.filter((e) => e.supabaseId).map((e) => e.id),
  );
  const localOnlyEventIds = new Set(
    mergedEvents.filter((e) => !e.supabaseId).map((e) => e.id),
  );
  const pulledEventIds = new Set(mergedEvents.map((e) => e.id));

  const localBySupabaseId = new Map(
    localPairs.filter((p) => resolveDbId(p)).map((p) => [resolveDbId(p)!, p]),
  );

  const mergedRemote = remappedRemote.map((remote) => {
    const dbId = resolveDbId(remote);
    const existing = dbId ? localBySupabaseId.get(dbId) : undefined;
    return existing ? { ...remote, id: existing.id } : remote;
  });

  const remoteDbIds = new Set(
    mergedRemote.map((p) => resolveDbId(p)).filter((id): id is string => !!id),
  );

  const keptLocal = localPairs.filter((p) => {
    if (!pulledEventIds.has(p.eventId)) return true;
    if (localOnlyEventIds.has(p.eventId)) return true;
    if (!syncedEventIds.has(p.eventId)) return true;
    if (!resolveDbId(p)) return true;
    return !remoteDbIds.has(resolveDbId(p)!);
  });

  const byId = new Map<string, DoublesPair>();
  for (const pair of [...mergedRemote, ...keptLocal]) {
    byId.set(pair.id, pair);
  }
  return [...byId.values()];
}

function applyMergedParticipants(
  localAthletes: Athlete[],
  localPairs: DoublesPair[],
  remoteAthletes: Athlete[],
  remotePairs: DoublesPair[],
  mergedEvents: HyroxEvent[],
): { athletes: Athlete[]; pairs: DoublesPair[] } {
  const athletes = mergeAthletesAfterPull(localAthletes, remoteAthletes, mergedEvents);
  const pairs = mergePairsAfterPull(localPairs, remotePairs, mergedEvents, athletes);
  return { athletes, pairs };
}

async function pushOrganizerPendingEvents(organizerId: string): Promise<void> {
  const events = useEventsStore
    .getState()
    .events.filter((e) => e.organizerId === organizerId || !e.supabaseId);
  for (const event of events) {
    await pushEventToSupabase(event.id);
  }
}

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
    const isLiveRun = run?.status === 'in_progress';
    const status = isLiveRun || row.status === 'racing' ? 'racing' : row.status;
    return {
      id: localAthleteId,
      supabaseId: row.id,
      eventId: localEventId,
      name: row.name,
      bib: row.bib_number,
      categoryId: row.category_id ? catLocalByDb.get(row.category_id) ?? '' : '',
      pairId: pairLocalId,
      status,
      racingStartedAt: isLiveRun ? run?.started_at ?? null : null,
      totalMs: run?.status === 'finished' ? run?.total_ms ?? null : null,
      segmentTimes:
        run?.status === 'finished'
          ? segmentTimesFromDb(athleteRuns, segmentTimes, row.id, localEventId, false)
          : [],
    };
  });

  const pairs: DoublesPair[] = pairsDb.map((row) => {
    const localEventId = eventIdByDb.get(row.event_id)!;
    const localPairId = localIdFromDb('pair', row.id);
    pairLocalByDb.set(row.id, localPairId);
    const run = pairRuns.find((r) => r.pair_id === row.id);
    const isLiveRun = run?.status === 'in_progress';
    const status = isLiveRun || row.status === 'racing' ? 'racing' : row.status;
    return {
      id: localPairId,
      supabaseId: row.id,
      eventId: localEventId,
      categoryId: catLocalByDb.get(row.category_id) ?? '',
      bib: row.bib_number,
      athlete1Id: localIdFromDb('ath', row.athlete1_id),
      athlete2Id: localIdFromDb('ath', row.athlete2_id),
      teamName: row.team_name ?? undefined,
      status,
      racingStartedAt: isLiveRun ? run?.started_at ?? null : null,
      totalMs: run?.status === 'finished' ? run?.total_ms ?? null : null,
      segmentTimes:
        run?.status === 'finished'
          ? segmentTimesFromDb(pairRuns, pairSegmentTimes, row.id, localEventId, true)
          : [],
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

export async function pullJudgeAssignedData(userId: string): Promise<{
  events: HyroxEvent[];
  athletes: Athlete[];
  pairs: DoublesPair[];
  assignedLocalIds: string[];
}> {
  if (!isSupabaseConfigured()) {
    return { events: [], athletes: [], pairs: [], assignedLocalIds: [] };
  }

  let eventDbIds: string[] = [];

  const { data: rpcIds, error: rpcError } = await getSupabase().rpc(
    'list_my_assigned_event_ids',
  );

  if (!rpcError && rpcIds) {
    eventDbIds = [...new Set((rpcIds as string[]).filter(Boolean))];
  } else {
    const { data: staffRows, error: staffError } = await getSupabase()
      .from('event_staff')
      .select('event_id')
      .eq('user_id', userId);

    if (staffError) throw new Error(staffError.message);
    eventDbIds = [...new Set((staffRows ?? []).map((r) => r.event_id as string))];
  }
  if (!eventDbIds.length) {
    return { events: [], athletes: [], pairs: [], assignedLocalIds: [] };
  }

  const { data: eventRows, error: eventsError } = await getSupabase()
    .from('events')
    .select('id, organizer_id, name, event_date, location, status')
    .in('id', eventDbIds)
    .order('event_date', { ascending: false });

  if (eventsError) throw new Error(eventsError.message);

  const bundle = await loadBundleFromDbEvents((eventRows ?? []) as DbEvent[]);
  return {
    ...bundle,
    assignedLocalIds: bundle.events.map((e) => e.id),
  };
}

export type JudgeSyncResult = { ok: true } | { ok: false; reason: string };

export type AthleteSyncResult = { ok: true } | { ok: false; reason: string };

export async function pullAthleteParticipations(userEmail: string): Promise<{
  events: HyroxEvent[];
  athletes: Athlete[];
  pairs: DoublesPair[];
  participatingLocalIds: string[];
}> {
  if (!isSupabaseConfigured()) {
    return { events: [], athletes: [], pairs: [], participatingLocalIds: [] };
  }

  const email = userEmail.trim().toLowerCase();
  if (!email) {
    return { events: [], athletes: [], pairs: [], participatingLocalIds: [] };
  }

  const { data: athleteRows, error: athletesError } = await getSupabase()
    .from('athletes')
    .select('event_id')
    .ilike('email', email);

  if (athletesError) throw new Error(athletesError.message);

  const eventDbIds = [
    ...new Set((athleteRows ?? []).map((row) => row.event_id as string).filter(Boolean)),
  ];

  if (!eventDbIds.length) {
    return { events: [], athletes: [], pairs: [], participatingLocalIds: [] };
  }

  const { data: eventRows, error: eventsError } = await getSupabase()
    .from('events')
    .select('id, organizer_id, name, event_date, location, status')
    .in('id', eventDbIds)
    .in('status', ['open', 'live', 'finished'])
    .order('event_date', { ascending: false });

  if (eventsError) throw new Error(eventsError.message);

  const bundle = await loadBundleFromDbEvents((eventRows ?? []) as DbEvent[]);
  return {
    ...bundle,
    participatingLocalIds: bundle.events.map((e) => e.id),
  };
}

export async function pullAndMergeAthleteEvents(userEmail: string): Promise<AthleteSyncResult> {
  try {
    const { events: dbEvents, athletes: dbAthletes, pairs: dbPairs, participatingLocalIds } =
      await pullAthleteParticipations(userEmail);

    const remoteIds = new Set(dbEvents.map((e) => e.id));
    const eventState = useEventsStore.getState();
    const merged = dbEvents.map((remote) => {
      const existing = eventState.events.find(
        (e) => e.supabaseId === remote.supabaseId || e.id === remote.id,
      );
      return existing ? mergeEventsLocalRemote(remote, existing) : remote;
    });
    const mergedLocalIds = new Set(merged.map((e) => e.id));
    const mergedSupabaseIds = new Set(
      merged.map((e) => e.supabaseId).filter((id): id is string => !!id),
    );
    const kept = eventState.events.filter((e) => {
      if (mergedLocalIds.has(e.id)) return false;
      if (e.supabaseId && mergedSupabaseIds.has(e.supabaseId)) return false;
      if (remoteIds.has(e.id)) return false;
      return participatingLocalIds.includes(e.id);
    });

    useEventsStore.setState({
      events: dedupeEvents([...merged, ...kept]),
    });

    const athleteState = useAthletesStore.getState();
    const { athletes, pairs } = applyMergedParticipants(
      athleteState.athletes,
      athleteState.pairs,
      dbAthletes,
      dbPairs,
      merged,
    );
    useAthletesStore.setState({ athletes, pairs });

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao buscar suas provas';
    return { ok: false, reason: message };
  }
}

async function syncJudgeStationAssignments(events: HyroxEvent[]): Promise<void> {
  const rows = await fetchMyJudgeAssignments();
  const bySupabaseId = new Map(events.map((e) => [e.supabaseId!, e.id]));
  const assignments: Record<string, number | null> = {};

  for (const event of events) {
    if (!event.supabaseId) continue;
    const row = rows.find((r) => r.event_id === event.supabaseId);
    assignments[event.id] = row?.station_order ?? null;
  }

  if (Object.keys(assignments).length) {
    useEventStaffStore.getState().setJudgeStations(assignments);
  }
}

/** Sincroniza evento ao vivo para o juiz: status, atletas, estação designada e cronômetros. */
export async function syncJudgeEventLive(localEventId: string): Promise<void> {
  const event = useEventsStore.getState().events.find((e) => e.id === localEventId);
  if (!event?.supabaseId || !isSupabaseConfigured()) return;

  if (!event.segments?.length || stationSegmentOptions(event.segments).length === 0) {
    useEventsStore.getState().resetSegmentsToHyrox(localEventId);
  }

  const { data, error } = await getSupabase()
    .from('events')
    .select('id, organizer_id, name, event_date, location, status')
    .eq('id', event.supabaseId)
    .maybeSingle();

  if (error || !data) return;

  useEventsStore.setState((state) => ({
    events: state.events.map((e) =>
      e.id === localEventId
        ? {
            ...e,
            name: data.name,
            date: data.event_date,
            location: data.location,
            status: data.status as HyroxEvent['status'],
          }
        : e,
    ),
  }));

  const bundle = await loadBundleFromDbEvents([data as DbEvent]);
  const athleteState = useAthletesStore.getState();
  const freshEvent = useEventsStore.getState().events.find((e) => e.id === localEventId) ?? event;
  const { athletes, pairs } = applyMergedParticipants(
    athleteState.athletes,
    athleteState.pairs,
    bundle.athletes,
    bundle.pairs,
    [freshEvent],
  );
  useAthletesStore.setState({ athletes, pairs });
  await fetchAndApplyLiveRuns(localEventId);

  const rows = await fetchMyJudgeAssignments();
  const row = rows.find((r) => r.event_id === event.supabaseId);
  useEventStaffStore
    .getState()
    .setJudgeStationForEvent(localEventId, row?.station_order ?? null);
}

export async function pullAndMergeJudgeEvents(userId: string): Promise<JudgeSyncResult> {
  try {
    const { events: dbEvents, athletes: dbAthletes, pairs: dbPairs } =
      await pullJudgeAssignedData(userId);

    const remoteIds = new Set(dbEvents.map((e) => e.id));
    const eventState = useEventsStore.getState();
    const merged = dbEvents.map((remote) => {
      const existing = eventState.events.find(
        (e) => e.supabaseId === remote.supabaseId || e.id === remote.id,
      );
      return existing ? mergeEventsLocalRemote(remote, existing) : remote;
    });
    const mergedLocalIds = new Set(merged.map((e) => e.id));
    const mergedSupabaseIds = new Set(
      merged.map((e) => e.supabaseId).filter((id): id is string => !!id),
    );
    const kept = eventState.events.filter((e) => {
      if (mergedLocalIds.has(e.id)) return false;
      if (e.supabaseId && mergedSupabaseIds.has(e.supabaseId)) return false;
      if (remoteIds.has(e.id)) return false;
      return true;
    });

    useEventsStore.setState({
      events: dedupeEvents([...merged, ...kept]),
    });
    if (mergedLocalIds.size > 0) {
      useEventStaffStore.getState().setAssignedEventIds([...mergedLocalIds]);
    }

    const athleteState = useAthletesStore.getState();
    const { athletes, pairs } = applyMergedParticipants(
      athleteState.athletes,
      athleteState.pairs,
      dbAthletes,
      dbPairs,
      merged,
    );
    useAthletesStore.setState({ athletes, pairs });
    await syncJudgeStationAssignments(merged);

    for (const event of merged) {
      if (!event.segments?.length || stationSegmentOptions(event.segments).length === 0) {
        useEventsStore.getState().resetSegmentsToHyrox(event.id);
      }
    }

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao buscar eventos do juiz';
    return { ok: false, reason: message };
  }
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
  if (!isSupabaseConfigured()) {
    return { ok: false, reason: 'Este app não está configurado para a nuvem.' };
  }

  try {
    const { events: dbEvents, athletes: dbAthletes, pairs: dbPairs } =
      await pullPublicEventsFromSupabase();

    const publicIds = new Set(dbEvents.map((e) => e.id));
    const eventState = useEventsStore.getState();
    const kept = eventState.events.filter(
      (e) => !e.supabaseId && !publicIds.has(e.id) && e.status === 'draft',
    );
    const mergedRemote = dbEvents.map((remote) => {
      const existing = eventState.events.find(
        (e) => e.supabaseId === remote.supabaseId || e.id === remote.id,
      );
      return existing ? mergeEventsLocalRemote(remote, existing) : remote;
    });

    useEventsStore.setState({ events: dedupeEvents([...mergedRemote, ...kept]) });

    const athleteState = useAthletesStore.getState();
    const { athletes, pairs } = applyMergedParticipants(
      athleteState.athletes,
      athleteState.pairs,
      dbAthletes,
      dbPairs,
      mergedRemote,
    );
    useAthletesStore.setState({ athletes, pairs });

    return { ok: true, eventCount: dbEvents.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao buscar eventos';
    return { ok: false, reason: message };
  }
}

/** Atualiza atletas/duplas de um evento (status racing + início na nuvem). */
export async function pullEventParticipantsLive(localEventId: string): Promise<void> {
  await syncJudgeEventLive(localEventId);
}

export async function pullAndMergeFromSupabase(organizerId: string): Promise<void> {
  await pushOrganizerPendingEvents(organizerId);

  const pulled = await pullOrganizerDataFromSupabase(organizerId);
  if (!pulled) return;

  const { events: dbEvents, athletes: dbAthletes, pairs: dbPairs } = pulled;
  const eventState = useEventsStore.getState();
  const localOnly = eventState.events.filter(
    (e) => !e.supabaseId && !dbIdFromLocalId(e.id) && e.organizerId === organizerId,
  );
  const mergedRemote = dbEvents.map((remote) => {
    const existing = eventState.events.find(
      (e) => e.supabaseId === remote.supabaseId || e.id === remote.id,
    );
    return existing ? mergeEventsLocalRemote(remote, existing) : remote;
  });

  useEventsStore.setState({ events: dedupeEvents([...mergedRemote, ...localOnly]) });

  const athleteState = useAthletesStore.getState();
  const { athletes, pairs } = applyMergedParticipants(
    athleteState.athletes,
    athleteState.pairs,
    dbAthletes,
    dbPairs,
    mergedRemote,
  );
  useAthletesStore.setState({ athletes, pairs });
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

  const {
    data: { user },
  } = await getSupabase().auth.getUser();
  if (!user) {
    return { ok: false, reason: 'Faça login para sincronizar o evento com a nuvem.' };
  }

  const ensured = await ensureEventInSupabase(event);
  if (!ensured.ok) return ensured;
  const dbEventId = ensured.data!;

  const { data: cloudEvent, error: cloudEventError } = await getSupabase()
    .from('events')
    .select('organizer_id')
    .eq('id', dbEventId)
    .maybeSingle();

  if (cloudEventError) return { ok: false, reason: cloudEventError.message };

  const localOwnsEvent =
    event.organizerId === user.id ||
    event.organizerId.startsWith('org-') ||
    event.organizerId === 'legacy';

  if (cloudEvent && cloudEvent.organizer_id !== user.id && localOwnsEvent) {
    const { error: ownerError } = await getSupabase()
      .from('events')
      .update({ organizer_id: user.id })
      .eq('id', dbEventId);
    if (ownerError) return { ok: false, reason: ownerError.message };
  }

  if (event.supabaseId !== dbEventId || event.organizerId !== user.id) {
    useEventsStore.setState((state) => ({
      events: state.events.map((e) =>
        e.id === eventId ? { ...e, supabaseId: dbEventId, organizerId: user.id } : e,
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
