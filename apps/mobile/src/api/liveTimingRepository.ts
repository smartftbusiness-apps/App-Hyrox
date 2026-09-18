import type { HyroxEvent, Segment } from '@/src/domain/types';

import { getTemplateSegmentIdByOrder } from '@/src/api/segmentTemplate';

import { resolveDbId } from '@/src/api/repositoryTypes';

import { getSupabase, isSupabaseConfigured } from '@/src/lib/supabase';

import { useAthletesStore } from '@/src/stores/athletesStore';

import { useEventsStore } from '@/src/stores/eventsStore';

import { buildTimingParticipants, type TimingParticipant } from '@/src/utils/participantHelpers';
import { isParticipantVisibleToJudge, isRunAtJudgeStation } from '@/src/utils/stationTiming';

import {
  buildTimingRunFromSnapshot,
  type LiveRunSnapshot,
  participantKey,
  stationProgressFromRun,
  type StationProgressMark,
  type TimingRunState,
} from '@/src/utils/timingRun';



type LiveRunRow = {

  participant_kind: string;

  participant_id: string;

  run_id: string;

  started_at: string | null;

  current_segment_order: number | null;

  current_segment_started_at: string | null;

  penalties_ms: number | null;

  live_complete_at: string | null;

  completed_segments: LiveRunSnapshot['completedSegments'] | null;

  updated_at: string;

  bib?: number | null;

};



function normalizeCompletedSegments(raw: unknown): LiveRunSnapshot['completedSegments'] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const row = item as Record<string, unknown>;
      return {
        segmentOrder: Number(row.segmentOrder ?? row.segment_order ?? 0),
        durationMs: Number(row.durationMs ?? row.duration_ms ?? 0),
      };
    })
    .filter((item) => item.segmentOrder > 0);
}

function mapLiveRow(row: LiveRunRow): LiveRunSnapshot | null {

  if (!row.started_at) return null;

  return {

    participantKind: row.participant_kind === 'pair' ? 'pair' : 'athlete',

    participantDbId: row.participant_id,

    runId: row.run_id,

    startedAt: row.started_at,

    currentSegmentOrder: row.current_segment_order,

    currentSegmentStartedAt: row.current_segment_started_at,

    penaltiesMs: row.penalties_ms ?? 0,

    liveCompleteAt: row.live_complete_at,

    completedSegments: normalizeCompletedSegments(row.completed_segments),

    updatedAt: row.updated_at,

    bib: row.bib ?? null,

  };

}



function matchParticipantByBib(
  participants: TimingParticipant[],
  bib: number,
  preferredType?: 'athlete' | 'pair',
): TimingParticipant | undefined {
  if (preferredType) {
    const exact = participants.find((p) => p.type === preferredType && p.bib === bib);
    if (exact) return exact;
  }
  return participants.find((p) => p.bib === bib);
}

function findLocalParticipant(

  localEventId: string,

  snapshot: LiveRunSnapshot,

  participants: TimingParticipant[],

): TimingParticipant | undefined {

  const { athletes, pairs } = useAthletesStore.getState();

  if (snapshot.participantKind === 'athlete') {

    const athlete = athletes.find(

      (a) =>

        (a.eventId === localEventId || !!localEventId) &&

        (a.supabaseId === snapshot.participantDbId ||

          resolveDbId(a) === snapshot.participantDbId ||

          a.id === snapshot.participantDbId),

    );

    if (athlete) {
      return (
        participants.find((p) => p.type === 'athlete' && p.id === athlete.id) ??
        matchParticipantByBib(participants, athlete.bib, 'athlete')
      );
    }

  }

  const pair = pairs.find(

    (p) =>

      (p.eventId === localEventId || !!localEventId) &&

      (p.supabaseId === snapshot.participantDbId ||

        resolveDbId(p) === snapshot.participantDbId ||

        p.id === snapshot.participantDbId),

  );

  if (pair) {
    return (
      participants.find((p) => p.type === 'pair' && p.id === pair.id) ??
      matchParticipantByBib(participants, pair.bib, 'pair')
    );
  }

  if (snapshot.bib != null) {
    return matchParticipantByBib(participants, snapshot.bib, snapshot.participantKind);
  }

  return undefined;

}

async function resolveParticipantDbId(
  event: { id: string; supabaseId?: string | null },
  participant: TimingParticipant,
): Promise<{ kind: 'athlete' | 'pair'; dbId: string } | null> {
  if (!event.supabaseId) return null;
  const { athletes, pairs } = useAthletesStore.getState();

  if (participant.type === 'pair') {
    const pair = pairs.find((p) => p.id === participant.id && p.eventId === event.id);
    let dbId = pair ? resolveDbId(pair) : null;
    if (!dbId) {
      const { data } = await getSupabase()
        .from('doubles_pairs')
        .select('id')
        .eq('event_id', event.supabaseId)
        .eq('bib_number', participant.bib)
        .maybeSingle();
      dbId = data?.id ?? null;
      if (dbId && pair) {
        useAthletesStore.setState((state) => ({
          pairs: state.pairs.map((p) =>
            p.id === pair.id ? { ...p, supabaseId: dbId } : p,
          ),
        }));
      }
    }
    if (dbId) return { kind: 'pair', dbId };
  }

  const athlete = athletes.find((a) => a.id === participant.id && a.eventId === event.id);
  let athleteDbId = athlete ? resolveDbId(athlete) : null;
  if (!athleteDbId) {
    const { data } = await getSupabase()
      .from('athletes')
      .select('id')
      .eq('event_id', event.supabaseId)
      .eq('bib_number', participant.bib)
      .maybeSingle();
    athleteDbId = data?.id ?? null;
    if (athleteDbId && athlete) {
      useAthletesStore.setState((state) => ({
        athletes: state.athletes.map((a) =>
          a.id === athlete.id ? { ...a, supabaseId: athleteDbId } : a,
        ),
      }));
    }
  }
  if (athleteDbId) return { kind: 'athlete', dbId: athleteDbId };
  return null;
}



/** Busca snapshots de cronômetros ao vivo na nuvem. */

export async function fetchLiveTimingSnapshots(

  localEventId: string,

): Promise<LiveRunSnapshot[]> {

  const event = useEventsStore.getState().events.find((e) => e.id === localEventId);

  if (!event?.supabaseId || !isSupabaseConfigured()) return [];



  const { data, error } = await getSupabase().rpc('list_event_live_runs', {

    p_event_id: event.supabaseId,

  });



  const rpcRows = !error && data?.length ? (data as LiveRunRow[]) : [];

  const [athleteRes, pairRes] = await Promise.all([
    getSupabase()
      .from('athlete_runs')
      .select(
        'id, athlete_id, started_at, current_segment_order, current_segment_started_at, penalties_ms, live_complete_at, updated_at',
      )
      .eq('event_id', event.supabaseId)
      .eq('status', 'in_progress'),
    getSupabase()
      .from('pair_runs')
      .select(
        'id, pair_id, started_at, current_segment_order, current_segment_started_at, penalties_ms, live_complete_at, updated_at',
      )
      .eq('event_id', event.supabaseId)
      .eq('status', 'in_progress'),
  ]);

  const athleteIds = (athleteRes.data ?? []).map((row: { athlete_id: string }) => row.athlete_id);
  const pairIds = (pairRes.data ?? []).map((row: { pair_id: string }) => row.pair_id);
  const [athleteBibRes, pairBibRes] = await Promise.all([
    athleteIds.length
      ? getSupabase().from('athletes').select('id, bib_number').in('id', athleteIds)
      : Promise.resolve({ data: [] as Array<{ id: string; bib_number: number }> }),
    pairIds.length
      ? getSupabase().from('doubles_pairs').select('id, bib_number').in('id', pairIds)
      : Promise.resolve({ data: [] as Array<{ id: string; bib_number: number }> }),
  ]);
  const athleteBibById = new Map(
    ((athleteBibRes.data ?? []) as Array<{ id: string; bib_number: number }>).map((row) => [
      row.id,
      row.bib_number,
    ]),
  );
  const pairBibById = new Map(
    ((pairBibRes.data ?? []) as Array<{ id: string; bib_number: number }>).map((row) => [
      row.id,
      row.bib_number,
    ]),
  );

  const fallback: LiveRunRow[] = [
    ...((athleteRes.data ?? []) as Array<{
      id: string;
      athlete_id: string;
      started_at: string | null;
      current_segment_order: number | null;
      current_segment_started_at: string | null;
      penalties_ms: number | null;
      live_complete_at: string | null;
      updated_at: string;
    }>).map((row) => ({
      participant_kind: 'athlete',
      participant_id: row.athlete_id,
      run_id: row.id,
      started_at: row.started_at,
      current_segment_order: row.current_segment_order,
      current_segment_started_at: row.current_segment_started_at,
      penalties_ms: row.penalties_ms,
      live_complete_at: row.live_complete_at,
      completed_segments: [],
      updated_at: row.updated_at,
      bib: athleteBibById.get(row.athlete_id) ?? null,
    })),
    ...((pairRes.data ?? []) as Array<{
      id: string;
      pair_id: string;
      started_at: string | null;
      current_segment_order: number | null;
      current_segment_started_at: string | null;
      penalties_ms: number | null;
      live_complete_at: string | null;
      updated_at: string;
    }>).map((row) => ({
      participant_kind: 'pair',
      participant_id: row.pair_id,
      run_id: row.id,
      started_at: row.started_at,
      current_segment_order: row.current_segment_order,
      current_segment_started_at: row.current_segment_started_at,
      penalties_ms: row.penalties_ms,
      live_complete_at: row.live_complete_at,
      completed_segments: [],
      updated_at: row.updated_at,
      bib: pairBibById.get(row.pair_id) ?? null,
    })),
  ];

  const merged = new Map<string, LiveRunSnapshot>();
  for (const row of fallback) {
    const mapped = mapLiveRow(row);
    if (mapped) merged.set(mapped.runId, mapped);
  }
  for (const row of rpcRows) {
    const mapped = mapLiveRow(row);
    if (!mapped) continue;
    const prev = merged.get(mapped.runId);
    merged.set(mapped.runId, {
      ...mapped,
      completedSegments: mapped.completedSegments.length
        ? mapped.completedSegments
        : prev?.completedSegments ?? [],
      currentSegmentOrder: mapped.currentSegmentOrder ?? prev?.currentSegmentOrder ?? null,
      bib: mapped.bib ?? prev?.bib ?? null,
    });
  }
  return Array.from(merged.values());

}



export type CloudTimingRun = {
  run: TimingRunState;
  updatedAt: string;
};

/** Converte snapshots da nuvem em TimingRunState por participantKey. */
export function buildRunsFromSnapshots(
  snapshots: LiveRunSnapshot[],
  localEventId: string,
  participants: TimingParticipant[],
  segments: Segment[],
): Map<string, CloudTimingRun> {
  const result = new Map<string, CloudTimingRun>();
  for (const snapshot of snapshots) {
    const participant = findLocalParticipant(localEventId, snapshot, participants);
    if (!participant) continue;
    const run = buildTimingRunFromSnapshot(participant, snapshot, segments);
    result.set(participantKey(participant), { run, updatedAt: snapshot.updatedAt });
  }
  return result;
}

/** Cronômetros ao vivo de atletas que estão na estação do juiz. */
export async function fetchJudgeStationCloudRuns(
  localEventId: string,
  stationOrder: number,
): Promise<Map<string, CloudTimingRun>> {
  const event = useEventsStore.getState().events.find((e) => e.id === localEventId);
  if (!event?.supabaseId || !isSupabaseConfigured()) return new Map();

  const segments = event.segments ?? [];
  const { athletes, pairs } = useAthletesStore.getState();
  const participants = buildTimingParticipants(athletes, pairs, event.categories);
  const snapshots = await fetchLiveTimingSnapshots(localEventId);
  const all = buildRunsFromSnapshots(snapshots, localEventId, participants, segments);

  const snapshotByKey = new Map<string, LiveRunSnapshot>();
  for (const snapshot of snapshots) {
    const participant = findLocalParticipant(localEventId, snapshot, participants);
    if (participant) snapshotByKey.set(participantKey(participant), snapshot);
  }

  const filtered = new Map<string, CloudTimingRun>();
  for (const [key, entry] of all) {
    const snapshot = snapshotByKey.get(key);
    if (!snapshot) continue;
    if (
      isRunAtJudgeStation(entry.run, snapshot, segments, stationOrder) ||
      isParticipantVisibleToJudge(entry.run, segments, stationOrder)
    ) {
      filtered.set(key, entry);
    }
  }
  return filtered;
}

/** Lista de cronômetros de atletas na estação do juiz (ordenado por bib). */
export async function fetchRunsAtJudgeStation(
  localEventId: string,
  stationOrder: number,
): Promise<TimingRunState[]> {
  const cloud = await fetchJudgeStationCloudRuns(localEventId, stationOrder);
  return Array.from(cloud.values())
    .map((entry) => entry.run)
    .sort((a, b) => a.participant.bib - b.participant.bib);
}

/** Atualiza status racing + racingStartedAt no store local. */

export async function fetchAndApplyLiveRuns(localEventId: string): Promise<void> {

  const snapshots = await fetchLiveTimingSnapshots(localEventId);

  if (!snapshots.length) return;



  const racing = 'racing' as const;

  const athleteStarts = new Map<string, string>();

  const pairStarts = new Map<string, string>();



  for (const snapshot of snapshots) {

    if (snapshot.participantKind === 'athlete') {

      athleteStarts.set(snapshot.participantDbId, snapshot.startedAt);

    } else {

      pairStarts.set(snapshot.participantDbId, snapshot.startedAt);

    }

  }



  useAthletesStore.setState((state) => ({

    athletes: state.athletes.map((a) => {

      if (a.eventId !== localEventId) return a;

      const dbId = resolveDbId(a);

      const started = dbId ? athleteStarts.get(dbId) : undefined;

      if (started) return { ...a, status: racing, racingStartedAt: started };

      if (a.pairId) {

        const pair = state.pairs.find((p) => p.id === a.pairId && p.eventId === localEventId);

        const pairDbId = pair ? resolveDbId(pair) : null;

        const pairStarted = pairDbId ? pairStarts.get(pairDbId) : undefined;

        if (pairStarted) return { ...a, status: racing, racingStartedAt: pairStarted };

      }

      return a;

    }),

    pairs: state.pairs.map((p) => {

      if (p.eventId !== localEventId) return p;

      const dbId = resolveDbId(p);

      const started = dbId ? pairStarts.get(dbId) : undefined;

      if (!started) return p;

      return { ...p, status: racing, racingStartedAt: started };

    }),

  }));

}



async function upsertCompletedSegments(
  runId: string,
  isPair: boolean,
  run: TimingRunState,
  segments: Segment[],
): Promise<void> {
  const durationByOrder = new Map<number, number>();
  for (const st of run.segmentTimes) {
    const order = segments.find((s) => s.id === st.segmentId)?.order;
    if (order) durationByOrder.set(order, st.durationMs);
  }
  for (const idx of run.completed) {
    const order = segments[idx]?.order;
    if (order && !durationByOrder.has(order)) durationByOrder.set(order, 0);
  }

  for (const [order, durationMs] of durationByOrder) {
    const segmentDbId = await getTemplateSegmentIdByOrder(order);
    if (!segmentDbId) continue;

    if (isPair) {
      await getSupabase().from('pair_segment_times').upsert(
        {
          pair_run_id: runId,
          segment_id: segmentDbId,
          duration_ms: durationMs,
        },
        { onConflict: 'pair_run_id,segment_id' },
      );
    } else {
      await getSupabase().from('segment_times').upsert(
        {
          athlete_run_id: runId,
          segment_id: segmentDbId,
          duration_ms: durationMs,
        },
        { onConflict: 'athlete_run_id,segment_id' },
      );
    }
  }
}



async function updateRunLiveState(
  table: 'athlete_runs' | 'pair_runs',
  runId: string,
  run: TimingRunState,
  segments: Segment[],
  now: number,
): Promise<void> {
  const currentSegment = run.raceComplete ? null : segments[run.segmentIndex];
  await getSupabase()
    .from(table)
    .update({
      current_segment_order: currentSegment?.order ?? null,
      current_segment_started_at: run.raceComplete
        ? null
        : run.segmentStartedAt
          ? new Date(run.segmentStartedAt).toISOString()
          : null,
      penalties_ms: run.penaltiesMs,
      live_complete_at: run.raceComplete ? new Date(now).toISOString() : null,
      status: run.raceComplete ? 'finished' : 'in_progress',
      finished_at: run.raceComplete ? new Date(now).toISOString() : null,
      total_ms: run.raceComplete ? run.frozenTotalMs || null : null,
    })
    .eq('id', runId);

  if (run.raceComplete) {
    // fecha corridas duplicadas in_progress do mesmo participante
    const idColumn = table === 'pair_runs' ? 'pair_id' : 'athlete_id';
    const { data: row } = await getSupabase().from(table).select(idColumn).eq('id', runId).maybeSingle();
    const participantId = row ? (row as Record<string, string>)[idColumn] : null;
    if (participantId) {
      await getSupabase()
        .from(table)
        .update({
          status: 'finished',
          live_complete_at: new Date(now).toISOString(),
          finished_at: new Date(now).toISOString(),
        })
        .eq(idColumn, participantId)
        .eq('status', 'in_progress')
        .neq('id', runId);
    }
  }
}



/** Envia estado completo do cronômetro para a nuvem. */

export async function pushTimingRunState(
  event: HyroxEvent,
  run: TimingRunState,
  segments: Segment[],
  now: number,
): Promise<void> {
  if (!isSupabaseConfigured() || !event.supabaseId) return;

  await persistLiveStationProgress(event, run, segments);

  const { participant } = run;
  await startLiveRunInCloud(event, participant, new Date(run.raceStartedAt).toISOString());
  const resolved = await resolveParticipantDbId(event, participant);
  if (!resolved) return;

  const isPair = resolved.kind === 'pair';
  const table = isPair ? 'pair_runs' : 'athlete_runs';
  const idColumn = isPair ? 'pair_id' : 'athlete_id';

  let { data: existingRows } = await getSupabase()
    .from(table)
    .select('id, updated_at')
    .eq(idColumn, resolved.dbId)
    .eq('status', 'in_progress')
    .order('updated_at', { ascending: false })
    .limit(5);
  let existing = (existingRows?.[0] as { id: string; updated_at?: string } | undefined) ?? null;
  // fecha duplicatas in_progress antigas
  if (existingRows && existingRows.length > 1 && existing?.id) {
    const keepId = existing.id;
    const staleIds = existingRows
      .slice(1)
      .map((row: { id: string }) => row.id)
      .filter(Boolean);
    if (staleIds.length) {
      await getSupabase()
        .from(table)
        .update({ status: 'finished', finished_at: new Date(now).toISOString() })
        .in('id', staleIds);
    }
  }

  if (!existing?.id) {
    const startedAt = new Date(run.raceStartedAt).toISOString();
    const inserted = isPair
      ? await getSupabase()
          .from('pair_runs')
          .insert({
            pair_id: resolved.dbId,
            event_id: event.supabaseId,
            status: 'in_progress',
            started_at: startedAt,
          })
          .select('id')
          .maybeSingle()
      : await getSupabase()
          .from('athlete_runs')
          .insert({
            athlete_id: resolved.dbId,
            event_id: event.supabaseId,
            status: 'in_progress',
            started_at: startedAt,
          })
          .select('id')
          .maybeSingle();
    existing = inserted.data ? { id: inserted.data.id } : null;
  }

  if (!existing?.id) return;

  await upsertCompletedSegments(existing.id, isPair, run, segments);
  await updateRunLiveState(table, existing.id, run, segments, now);
}

export async function persistLiveStationProgress(
  event: HyroxEvent,
  run: TimingRunState,
  segments: Segment[],
): Promise<void> {
  if (!isSupabaseConfigured() || !event.supabaseId) return;
  const { completedOrders, currentOrder } = stationProgressFromRun(run, segments);
  const bib = run.participant.bib;
  patchLocalStationProgress(event.id, bib, completedOrders, currentOrder);
  await broadcastStationProgress(event.supabaseId, bib, { completedOrders, currentOrder });

  void persistStationProgressToSql(event, bib, completedOrders, currentOrder);
}

async function persistStationProgressToSql(
  event: HyroxEvent,
  bib: number,
  completedOrders: number[],
  currentOrder: number | null,
): Promise<void> {
  if (!event.supabaseId) return;
  const rpc = await getSupabase().rpc('upsert_live_station_progress', {
    p_event_id: event.supabaseId,
    p_bib: bib,
    p_completed_orders: completedOrders,
    p_current_order: currentOrder,
  });
  if (!rpc.error) return;

  const { data } = await getSupabase()
    .from('events')
    .select('live_station_progress')
    .eq('id', event.supabaseId)
    .maybeSingle();
  if (data && 'live_station_progress' in data) {
    const current =
      (data.live_station_progress as Record<string, StationProgressMark> | null) ?? {};
    const next = {
      ...current,
      [String(bib)]: { completedOrders, currentOrder },
    };
    await getSupabase()
      .from('events')
      .update({ live_station_progress: next })
      .eq('id', event.supabaseId);
  }
}

function patchLocalStationProgress(
  localEventId: string,
  bib: number,
  completedOrders: number[],
  currentOrder: number | null,
): void {
  useEventsStore.setState((state) => ({
    events: state.events.map((event) =>
      event.id === localEventId
        ? {
            ...event,
            liveStationProgress: {
              ...(event.liveStationProgress ?? {}),
              [String(bib)]: { completedOrders, currentOrder },
            },
          }
        : event,
    ),
  }));
}

export async function fetchLiveStationProgress(
  eventDbId: string,
): Promise<Record<string, StationProgressMark>> {
  if (!isSupabaseConfigured()) return {};
  const table = await getSupabase()
    .from('live_station_progress')
    .select('bib, completed_orders, current_order')
    .eq('event_id', eventDbId);
  if (!table.error && table.data?.length) {
    const map: Record<string, StationProgressMark> = {};
    for (const row of table.data as Array<{
      bib: number;
      completed_orders: number[] | null;
      current_order: number | null;
    }>) {
      map[String(row.bib)] = {
        completedOrders: row.completed_orders ?? [],
        currentOrder: row.current_order,
      };
    }
    return map;
  }
  const eventRow = await getSupabase()
    .from('events')
    .select('live_station_progress')
    .eq('id', eventDbId)
    .maybeSingle();
  if (eventRow.error || !eventRow.data) return {};
  return (eventRow.data.live_station_progress as Record<string, StationProgressMark> | null) ?? {};
}



const STATION_PROGRESS_EVENT = 'station-progress';
const COURSE_LAYOUT_EVENT = 'course-layout';

function progressTopic(eventDbId: string): string {
  return `hyrox-progress-${eventDbId}`;
}

export async function broadcastCourseLayout(
  eventDbId: string,
  segments: Segment[],
  heats: import('@/src/domain/types').EventHeat[] = [],
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const client = getSupabase();
  const topic = progressTopic(eventDbId);
  let channel = client.getChannels().find((ch) => ch.topic.includes(topic));
  if (!channel) {
    channel = client.channel(topic, { config: { broadcast: { ack: false, self: false } } });
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => resolve(), 1200);
      channel!.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
  }
  await channel.send({
    type: 'broadcast',
    event: COURSE_LAYOUT_EVENT,
    payload: {
      segments: segments.map((s) => ({
        order: s.order,
        type: s.type,
        name: s.name,
        target: s.target,
      })),
      heats,
    },
  });
}

export async function broadcastStationProgress(
  eventDbId: string,
  bib: number,
  mark: StationProgressMark,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const client = getSupabase();
  const topic = progressTopic(eventDbId);
  let channel = client.getChannels().find((ch) => ch.topic.includes(topic));
  if (!channel) {
    channel = client.channel(topic, { config: { broadcast: { ack: false, self: false } } });
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => resolve(), 1200);
      channel!.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
  }
  await channel.send({
    type: 'broadcast',
    event: STATION_PROGRESS_EVENT,
    payload: { bib, ...mark, at: Date.now() },
  });
}

/** Assina o relógio da prova e as corridas ao vivo (Realtime). */
export function subscribeEventLiveClock(
  eventDbId: string,
  onChange: () => void,
  onStationProgress?: (bib: number, mark: StationProgressMark) => void,
  onCourseLayout?: (
    segments: Array<{ order: number; type: 'run' | 'station'; name: string; target: string }>,
    heats: import('@/src/domain/types').EventHeat[],
  ) => void,
): () => void {
  if (!isSupabaseConfigured()) return () => {};

  const client = getSupabase();
  const topicPrefix = `hyrox-live-${eventDbId}`;
  const topic = `${topicPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const progressName = progressTopic(eventDbId);
  let channel: ReturnType<typeof client.channel> | null = null;
  let progressChannel: ReturnType<typeof client.channel> | null = null;
  let disposed = false;

  const notify = () => {
    if (!disposed) onChange();
  };

  try {
    for (const existing of client.getChannels()) {
      if (existing.topic.includes(topicPrefix) || existing.topic.includes(progressName)) {
        void client.removeChannel(existing);
      }
    }

    const next = client.channel(topic);
    if (next.state === 'joined' || next.state === 'joining') {
      return () => {
        disposed = true;
      };
    }
    next.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'events', filter: `id=eq.${eventDbId}` },
      notify,
    );
    next.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'athlete_runs', filter: `event_id=eq.${eventDbId}` },
      notify,
    );
    next.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'pair_runs', filter: `event_id=eq.${eventDbId}` },
      notify,
    );
    next.subscribe();
    channel = next;

    const progress = client.channel(progressName, {
      config: { broadcast: { ack: false, self: false } },
    });
    progress.on('broadcast', { event: STATION_PROGRESS_EVENT }, (message) => {
      const payload = message.payload as {
        bib?: number;
        completedOrders?: number[];
        currentOrder?: number | null;
      };
      if (typeof payload?.bib !== 'number') {
        notify();
        return;
      }
      onStationProgress?.(payload.bib, {
        completedOrders: payload.completedOrders ?? [],
        currentOrder: payload.currentOrder ?? null,
      });
      notify();
    });
    progress.on('broadcast', { event: COURSE_LAYOUT_EVENT }, (message) => {
      const payload = message.payload as {
        segments?: Array<{ order: number; type: 'run' | 'station'; name: string; target: string }>;
        heats?: import('@/src/domain/types').EventHeat[];
      };
      if (payload?.segments?.length) {
        onCourseLayout?.(payload.segments, payload.heats ?? []);
      }
      notify();
    });
    progress.subscribe();
    progressChannel = progress;
  } catch {
    return () => {
      disposed = true;
    };
  }

  return () => {
    disposed = true;
    if (channel) void client.removeChannel(channel);
    if (progressChannel) void client.removeChannel(progressChannel);
  };
}

/** Registra início da prova na nuvem para outros juízes/organizadores verem. */

export async function startLiveRunInCloud(

  event: HyroxEvent,

  participant: TimingParticipant,

  startedAtIso: string,

): Promise<void> {

  if (!isSupabaseConfigured() || !event.supabaseId) return;



  const dbEventId = event.supabaseId;

  const firstSegmentOrder = event.segments[0]?.order ?? 1;

  const resolved = await resolveParticipantDbId(event, participant);
  if (!resolved) return;

  if (resolved.kind === 'athlete') {

    const dbAthleteId = resolved.dbId;



    await getSupabase()

      .from('athletes')

      .update({ status: 'racing' })

      .eq('id', dbAthleteId);



    const { data: existing } = await getSupabase()

      .from('athlete_runs')

      .select('id')

      .eq('athlete_id', dbAthleteId)

      .eq('status', 'in_progress')

      .maybeSingle();



    const liveFields = {

      started_at: startedAtIso,

      current_segment_order: firstSegmentOrder,

      current_segment_started_at: startedAtIso,

      penalties_ms: 0,

      live_complete_at: null,

    };



    if (!existing?.id) {

      const { error: insertError } = await getSupabase().from('athlete_runs').insert({

        athlete_id: dbAthleteId,

        event_id: dbEventId,

        status: 'in_progress',

        ...liveFields,

      });

      if (insertError) return;

    }



    useAthletesStore.setState((state) => ({

      athletes: state.athletes.map((a) =>

        a.id === participant.id && a.eventId === event.id

          ? { ...a, status: 'racing', racingStartedAt: startedAtIso }

          : a,

      ),

    }));

    return;

  }



  const dbPairId = resolved.dbId;



  await getSupabase()

    .from('doubles_pairs')

    .update({ status: 'racing' })

    .eq('id', dbPairId);



  const { data: existing } = await getSupabase()

    .from('pair_runs')

    .select('id')

    .eq('pair_id', dbPairId)

    .eq('status', 'in_progress')

    .maybeSingle();



  const liveFields = {

    started_at: startedAtIso,

    current_segment_order: firstSegmentOrder,

    current_segment_started_at: startedAtIso,

    penalties_ms: 0,

    live_complete_at: null,

  };



  if (!existing?.id) {

    const { error: insertError } = await getSupabase().from('pair_runs').insert({

      pair_id: dbPairId,

      event_id: dbEventId,

      status: 'in_progress',

      ...liveFields,

    });

    if (insertError) return;

  }



  useAthletesStore.setState((state) => ({

    pairs: state.pairs.map((p) =>

      p.id === participant.id && p.eventId === event.id

        ? { ...p, status: 'racing', racingStartedAt: startedAtIso }

        : p,

    ),

    athletes: state.athletes.map((a) =>

      a.pairId === participant.id && a.eventId === event.id

        ? { ...a, status: 'racing', racingStartedAt: startedAtIso }

        : a,

    ),

  }));

}


