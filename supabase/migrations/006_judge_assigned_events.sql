-- Juízes precisam ler suas próprias designações em event_staff (RLS bloqueava antes)

create or replace function public.list_my_assigned_event_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select event_id from event_staff where user_id = auth.uid();
$$;

grant execute on function public.list_my_assigned_event_ids() to authenticated;

drop policy if exists "event_staff_manage" on event_staff;
drop policy if exists "event_staff_organizer_manage" on event_staff;
drop policy if exists "event_staff_select_own" on event_staff;

create policy "event_staff_organizer_manage" on event_staff
  for all using (public.is_event_organizer(event_id));

create policy "event_staff_select_own" on event_staff
  for select using (user_id = auth.uid());
