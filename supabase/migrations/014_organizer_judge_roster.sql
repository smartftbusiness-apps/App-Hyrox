-- Cadastro de juízes pelo organizador antes de designar a eventos/estações

create table if not exists public.organizer_judge_roster (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (organizer_id, user_id)
);

create index if not exists idx_organizer_judge_roster_organizer
  on public.organizer_judge_roster(organizer_id);

alter table public.organizer_judge_roster enable row level security;

drop policy if exists "organizer_judge_roster_manage" on public.organizer_judge_roster;
create policy "organizer_judge_roster_manage" on public.organizer_judge_roster
  for all using (organizer_id = auth.uid())
  with check (organizer_id = auth.uid());

create or replace function public.add_organizer_judge_to_roster(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Faça login como organizador';
  end if;

  insert into public.organizer_judge_roster (organizer_id, user_id)
  values (auth.uid(), p_user_id)
  on conflict (organizer_id, user_id) do nothing;
end;
$$;

grant execute on function public.add_organizer_judge_to_roster(uuid) to authenticated;

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
  with organizer_judges as (
    select r.user_id
    from public.organizer_judge_roster r
    where r.organizer_id = auth.uid()
    union
    select es.user_id
    from public.event_staff es
    join public.events e on e.id = es.event_id
    where e.organizer_id = auth.uid()
  )
  select
    p.id as user_id,
    u.email::text,
    p.full_name,
    count(distinct es.event_id) filter (where e.organizer_id = auth.uid()) as events_count
  from organizer_judges oj
  join public.profiles p on p.id = oj.user_id
  join auth.users u on u.id = p.id
  left join public.event_staff es on es.user_id = p.id
  left join public.events e on e.id = es.event_id and e.organizer_id = auth.uid()
  where p.role = 'staff'::user_role
  group by p.id, u.email, p.full_name
  order by coalesce(nullif(trim(p.full_name), ''), u.email::text);
$$;

grant execute on function public.list_organizer_judges() to authenticated;
