-- Lista juízes já cadastrados pelo organizador (em qualquer evento dele)

drop function if exists public.list_organizer_judges();

create or replace function public.list_organizer_judges()
returns table (
  user_id uuid,
  email text,
  full_name text,
  events_count bigint
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    p.id as user_id,
    u.email::text,
    p.full_name,
    count(distinct es.event_id) as events_count
  from public.profiles p
  join auth.users u on u.id = p.id
  join public.event_staff es on es.user_id = p.id
  join public.events e on e.id = es.event_id
  where e.organizer_id = auth.uid()
    and p.role = 'staff'::user_role
  group by p.id, u.email, p.full_name
  order by coalesce(nullif(trim(p.full_name), ''), u.email::text);
$$;

grant execute on function public.list_organizer_judges() to authenticated;
