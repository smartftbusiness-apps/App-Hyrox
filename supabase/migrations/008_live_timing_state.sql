-- Estado completo do cronômetro ao vivo (organizador ↔ juízes)

alter table athlete_runs
  add column if not exists current_segment_order int,
  add column if not exists current_segment_started_at timestamptz,
  add column if not exists penalties_ms bigint not null default 0,
  add column if not exists live_complete_at timestamptz;

alter table pair_runs
  add column if not exists current_segment_order int,
  add column if not exists current_segment_started_at timestamptz,
  add column if not exists penalties_ms bigint not null default 0,
  add column if not exists live_complete_at timestamptz;

drop function if exists public.list_event_live_runs(uuid);

create or replace function public.list_event_live_runs(p_event_id uuid)
returns table (
  participant_kind text,
  participant_id uuid,
  run_id uuid,
  started_at timestamptz,
  current_segment_order int,
  current_segment_started_at timestamptz,
  penalties_ms bigint,
  live_complete_at timestamptz,
  completed_segments jsonb,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    'athlete'::text,
    ar.athlete_id,
    ar.id,
    ar.started_at,
    ar.current_segment_order,
    ar.current_segment_started_at,
    ar.penalties_ms,
    ar.live_complete_at,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'segment_order', s.order_index,
            'duration_ms', st.duration_ms
          )
          order by s.order_index
        )
        from segment_times st
        join segments s on s.id = st.segment_id
        where st.athlete_run_id = ar.id
      ),
      '[]'::jsonb
    ),
    ar.updated_at
  from athlete_runs ar
  where ar.event_id = p_event_id
    and ar.status = 'in_progress'
    and public.can_manage_event(p_event_id)
  union all
  select
    'pair'::text,
    pr.pair_id,
    pr.id,
    pr.started_at,
    pr.current_segment_order,
    pr.current_segment_started_at,
    pr.penalties_ms,
    pr.live_complete_at,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'segment_order', s.order_index,
            'duration_ms', pst.duration_ms
          )
          order by s.order_index
        )
        from pair_segment_times pst
        join segments s on s.id = pst.segment_id
        where pst.pair_run_id = pr.id
      ),
      '[]'::jsonb
    ),
    pr.updated_at
  from pair_runs pr
  where pr.event_id = p_event_id
    and pr.status = 'in_progress'
    and public.can_manage_event(p_event_id);
$$;

grant execute on function public.list_event_live_runs(uuid) to authenticated;
