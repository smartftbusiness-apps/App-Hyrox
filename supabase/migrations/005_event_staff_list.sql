-- Lista juízes do evento com e-mail (organizador) — evita join em profiles bloqueado por RLS
create or replace function public.list_event_staff(p_event_id uuid)
returns table (
  id uuid,
  user_id uuid,
  email text,
  full_name text
)
language sql
security definer
set search_path = public
as $$
  select
    es.id,
    es.user_id,
    u.email::text,
    p.full_name
  from event_staff es
  join profiles p on p.id = es.user_id
  join auth.users u on u.id = es.user_id
  where es.event_id = p_event_id
    and public.is_event_organizer(p_event_id);
$$;

grant execute on function public.list_event_staff(uuid) to authenticated;
