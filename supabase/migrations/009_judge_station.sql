-- Juiz designado a uma estação (segmento tipo station)

alter table event_staff
  add column if not exists station_order int check (station_order is null or station_order > 0);

drop function if exists public.list_event_staff(uuid);

create or replace function public.list_event_staff(p_event_id uuid)
returns table (
  id uuid,
  user_id uuid,
  email text,
  full_name text,
  station_order int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    es.id,
    es.user_id,
    u.email::text,
    p.full_name,
    es.station_order
  from event_staff es
  join profiles p on p.id = es.user_id
  join auth.users u on u.id = es.user_id
  where es.event_id = p_event_id
    and public.is_event_organizer(p_event_id);
$$;

grant execute on function public.list_event_staff(uuid) to authenticated;

create or replace function public.list_my_judge_assignments()
returns table (
  event_id uuid,
  station_order int
)
language sql
stable
security definer
set search_path = public
as $$
  select es.event_id, es.station_order
  from event_staff es
  where es.user_id = auth.uid();
$$;

grant execute on function public.list_my_judge_assignments() to authenticated;
