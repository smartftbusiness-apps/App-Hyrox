import type { AthleteStatus, HyroxEvent } from '@/src/domain/types';
import { getSupabase, isSupabaseConfigured } from '@/src/lib/supabase';
import { resolveDbId } from '@/src/api/repositoryTypes';
import { useAthletesStore } from '@/src/stores/athletesStore';
import { useEventsStore } from '@/src/stores/eventsStore';
import type { TimingParticipant } from '@/src/utils/participantHelpers';

type LiveRunRow = {
  participant_kind: string;
  participant_id: string;
  started_at: string | null;
};

/** Aplica provas em andamento da nuvem ao store local (juiz vê o que o organizador iniciou). */
export async function fetchAndApplyLiveRuns(localEventId: string): Promise<void> {
  const event = useEventsStore.getState().events.find((e) => e.id === localEventId);
  if (!event?.supabaseId || !isSupabaseConfigured()) return;

  const { data, error } = await getSupabase().rpc('list_event_live_runs', {
    p_event_id: event.supabaseId,
  });

  if (error || !data?.length) return;

  const athleteStarts = new Map<string, string>();
  const pairStarts = new Map<string, string>();

  for (const row of data as LiveRunRow[]) {
    if (!row.started_at) continue;
    if (row.participant_kind === 'athlete') {
      athleteStarts.set(row.participant_id, row.started_at);
    } else if (row.participant_kind === 'pair') {
      pairStarts.set(row.participant_id, row.started_at);
    }
  }

  const racing: AthleteStatus = 'racing';

  useAthletesStore.setState((state) => ({
    athletes: state.athletes.map((a) => {
      if (a.eventId !== localEventId) return a;
      const dbId = resolveDbId(a);
      const started = dbId ? athleteStarts.get(dbId) : undefined;
      if (started) {
        return { ...a, status: racing, racingStartedAt: started };
      }
      if (a.pairId) {
        const pair = state.pairs.find((p) => p.id === a.pairId && p.eventId === localEventId);
        const pairDbId = pair ? resolveDbId(pair) : null;
        const pairStarted = pairDbId ? pairStarts.get(pairDbId) : undefined;
        if (pairStarted) {
          return { ...a, status: racing, racingStartedAt: pairStarted };
        }
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

/** Registra início da prova na nuvem para outros juízes/organizadores verem. */
export async function startLiveRunInCloud(
  event: HyroxEvent,
  participant: TimingParticipant,
): Promise<void> {
  if (!isSupabaseConfigured() || !event.supabaseId) return;

  const startedAt = new Date().toISOString();
  const dbEventId = event.supabaseId;

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

    if (existing?.id) {
      await getSupabase()
        .from('athlete_runs')
        .update({ started_at: startedAt })
        .eq('id', existing.id);
    } else {
      const { error: insertError } = await getSupabase().from('athlete_runs').insert({
        athlete_id: dbAthleteId,
        event_id: dbEventId,
        status: 'in_progress',
        started_at: startedAt,
      });
      if (insertError) return;
    }

    useAthletesStore.setState((state) => ({
      athletes: state.athletes.map((a) =>
        a.id === participant.id && a.eventId === event.id
          ? { ...a, status: 'racing', racingStartedAt: startedAt }
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

  if (existing?.id) {
    await getSupabase()
      .from('pair_runs')
      .update({ started_at: startedAt })
      .eq('id', existing.id);
  } else {
    const { error: insertError } = await getSupabase().from('pair_runs').insert({
      pair_id: dbPairId,
      event_id: dbEventId,
      status: 'in_progress',
      started_at: startedAt,
    });
    if (insertError) return;
  }

  useAthletesStore.setState((state) => ({
    pairs: state.pairs.map((p) =>
      p.id === participant.id && p.eventId === event.id
        ? { ...p, status: 'racing', racingStartedAt: startedAt }
        : p,
    ),
    athletes: state.athletes.map((a) =>
      a.pairId === participant.id && a.eventId === event.id
        ? { ...a, status: 'racing', racingStartedAt: startedAt }
        : a,
    ),
  }));
}
