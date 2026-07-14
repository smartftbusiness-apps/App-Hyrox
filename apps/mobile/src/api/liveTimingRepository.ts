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

};



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

    completedSegments: row.completed_segments ?? [],

    updatedAt: row.updated_at,

  };

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

        a.eventId === localEventId &&

        (a.supabaseId === snapshot.participantDbId ||

          resolveDbId(a) === snapshot.participantDbId),

    );

    if (!athlete) return undefined;

    return participants.find((p) => p.type === 'athlete' && p.id === athlete.id);

  }

  const pair = pairs.find(

    (p) =>

      p.eventId === localEventId &&

      (p.supabaseId === snapshot.participantDbId ||

        resolveDbId(p) === snapshot.participantDbId),

  );

  if (!pair) return undefined;

  return participants.find((p) => p.type === 'pair' && p.id === pair.id);

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



  if (error || !data?.length) return [];

  return (data as LiveRunRow[])

    .map(mapLiveRow)

    .filter((row): row is LiveRunSnapshot => !!row);

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

  for (const st of run.segmentTimes) {

    const order = segments.find((s) => s.id === st.segmentId)?.order;

    if (!order) continue;

    const segmentDbId = await getTemplateSegmentIdByOrder(order);

    if (!segmentDbId) continue;



    if (isPair) {

      await getSupabase().from('pair_segment_times').upsert(

        {

          pair_run_id: runId,

          segment_id: segmentDbId,

          duration_ms: st.durationMs,

        },

        { onConflict: 'pair_run_id,segment_id' },

      );

    } else {

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

    })

    .eq('id', runId);

}



/** Envia estado completo do cronômetro para a nuvem. */

export async function pushTimingRunState(

  event: HyroxEvent,

  run: TimingRunState,

  segments: Segment[],

  now: number,

): Promise<void> {

  if (!isSupabaseConfigured() || !event.supabaseId) return;



  const { participant } = run;

  const isPair = participant.type === 'pair';



  if (isPair) {

    const pair = useAthletesStore

      .getState()

      .pairs.find((p) => p.id === participant.id && p.eventId === event.id);

    const dbPairId = pair ? resolveDbId(pair) : null;

    if (!dbPairId) return;



    const { data: existing } = await getSupabase()

      .from('pair_runs')

      .select('id')

      .eq('pair_id', dbPairId)

      .eq('status', 'in_progress')

      .maybeSingle();



    if (!existing?.id) return;

    await upsertCompletedSegments(existing.id, true, run, segments);

    await updateRunLiveState('pair_runs', existing.id, run, segments, now);

    return;

  }



  const athlete = useAthletesStore

    .getState()

    .athletes.find((a) => a.id === participant.id && a.eventId === event.id);

  const dbAthleteId = athlete ? resolveDbId(athlete) : null;

  if (!dbAthleteId) return;



  const { data: existing } = await getSupabase()

    .from('athlete_runs')

    .select('id')

    .eq('athlete_id', dbAthleteId)

    .eq('status', 'in_progress')

    .maybeSingle();



  if (!existing?.id) return;

  await upsertCompletedSegments(existing.id, false, run, segments);

  await updateRunLiveState('athlete_runs', existing.id, run, segments, now);

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



  if (participant.type === 'athlete') {

    const athlete = useAthletesStore

      .getState()

      .athletes.find((a) => a.id === participant.id && a.eventId === event.id);

    const dbAthleteId = athlete ? resolveDbId(athlete) : null;

    if (!dbAthleteId) return;



    const { error: statusError } = await getSupabase()

      .from('athletes')

      .update({ status: 'racing' })

      .eq('id', dbAthleteId);

    if (statusError) return;



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



    if (existing?.id) {

      await getSupabase().from('athlete_runs').update(liveFields).eq('id', existing.id);

    } else {

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



  const pair = useAthletesStore

    .getState()

    .pairs.find((p) => p.id === participant.id && p.eventId === event.id);

  const dbPairId = pair ? resolveDbId(pair) : null;

  if (!dbPairId) return;



  const { error: pairStatusError } = await getSupabase()

    .from('doubles_pairs')

    .update({ status: 'racing' })

    .eq('id', dbPairId);

  if (pairStatusError) return;



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



  if (existing?.id) {

    await getSupabase().from('pair_runs').update(liveFields).eq('id', existing.id);

  } else {

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


