-- Lista provas em andamento para organizador e juízes designados
create or replace function public.list_event_live_runs(p_event_id uuid)
returns table (
  participant_kind text,
  participant_id uuid,
  started_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select 'athlete'::text, ar.athlete_id, ar.started_at
  from athlete_runs ar
  where ar.event_id = p_event_id
    and ar.status = 'in_progress'
    and public.can_manage_event(p_event_id)
  union all
  select 'pair'::text, pr.pair_id, pr.started_at
  from pair_runs pr
  where pr.event_id = p_event_id
    and pr.status = 'in_progress'
    and public.can_manage_event(p_event_id);
$$;

grant execute on function public.list_event_live_runs(uuid) to authenticated;
