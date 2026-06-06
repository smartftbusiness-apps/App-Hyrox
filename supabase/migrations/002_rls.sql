-- Row Level Security (RLS)

alter table profiles enable row level security;
alter table course_templates enable row level security;
alter table segments enable row level security;
alter table events enable row level security;
alter table event_staff enable row level security;
alter table categories enable row level security;
alter table athletes enable row level security;
alter table athlete_runs enable row level security;
alter table segment_times enable row level security;
alter table penalties enable row level security;
alter table doubles_pairs enable row level security;
alter table pair_runs enable row level security;
alter table pair_segment_times enable row level security;

-- Profiles: usuário vê/edita o próprio perfil
drop policy if exists "profiles_select_own" on profiles;
create policy "profiles_select_own" on profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on profiles;
create policy "profiles_update_own" on profiles
  for update using (auth.uid() = id);

-- Templates Hyrox: leitura pública (dados de referência)
drop policy if exists "templates_select_all" on course_templates;
create policy "templates_select_all" on course_templates
  for select to authenticated, anon using (true);

drop policy if exists "segments_select_all" on segments;
create policy "segments_select_all" on segments
  for select to authenticated, anon using (true);

-- Helper: é organizador do evento?
create or replace function public.is_event_organizer(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from events
    where id = p_event_id and organizer_id = auth.uid()
  );
$$;

-- Helper: é staff ou organizador do evento
create or replace function public.can_manage_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_event_organizer(p_event_id)
    or exists (
      select 1 from event_staff
      where event_id = p_event_id and user_id = auth.uid()
    );
$$;

-- Events
drop policy if exists "events_select_public_live" on events;
create policy "events_select_public_live" on events
  for select using (status in ('open', 'live', 'finished'));

drop policy if exists "events_select_own" on events;
create policy "events_select_own" on events
  for select using (organizer_id = auth.uid() or public.can_manage_event(id));

drop policy if exists "events_insert_own" on events;
create policy "events_insert_own" on events
  for insert with check (organizer_id = auth.uid());

drop policy if exists "events_update_own" on events;
create policy "events_update_own" on events
  for update using (public.can_manage_event(id));

drop policy if exists "events_delete_own" on events;
create policy "events_delete_own" on events
  for delete using (organizer_id = auth.uid());

-- Event staff
drop policy if exists "event_staff_manage" on event_staff;
create policy "event_staff_manage" on event_staff
  for all using (public.is_event_organizer(event_id));

-- Categories, athletes, runs, times: quem gerencia o evento
drop policy if exists "categories_manage" on categories;
create policy "categories_manage" on categories
  for all using (public.can_manage_event(event_id));

drop policy if exists "categories_select_public" on categories;
create policy "categories_select_public" on categories
  for select using (
    exists (select 1 from events e where e.id = event_id and e.status in ('open', 'live', 'finished'))
  );

drop policy if exists "athletes_manage" on athletes;
create policy "athletes_manage" on athletes
  for all using (public.can_manage_event(event_id));

drop policy if exists "athletes_select_public" on athletes;
create policy "athletes_select_public" on athletes
  for select using (
    exists (select 1 from events e where e.id = event_id and e.status in ('open', 'live', 'finished'))
  );

drop policy if exists "athlete_runs_manage" on athlete_runs;
create policy "athlete_runs_manage" on athlete_runs
  for all using (public.can_manage_event(event_id));

drop policy if exists "athlete_runs_select_public" on athlete_runs;
create policy "athlete_runs_select_public" on athlete_runs
  for select using (
    exists (select 1 from events e where e.id = event_id and e.status in ('live', 'finished'))
  );

drop policy if exists "segment_times_manage" on segment_times;
create policy "segment_times_manage" on segment_times
  for all using (
    exists (
      select 1 from athlete_runs ar
      where ar.id = athlete_run_id and public.can_manage_event(ar.event_id)
    )
  );

drop policy if exists "segment_times_select_public" on segment_times;
create policy "segment_times_select_public" on segment_times
  for select using (
    exists (
      select 1 from athlete_runs ar
      join events e on e.id = ar.event_id
      where ar.id = athlete_run_id and e.status in ('live', 'finished')
    )
  );

drop policy if exists "penalties_manage" on penalties;
create policy "penalties_manage" on penalties
  for all using (
    exists (
      select 1 from segment_times st
      join athlete_runs ar on ar.id = st.athlete_run_id
      where st.id = segment_time_id and public.can_manage_event(ar.event_id)
    )
  );

drop policy if exists "doubles_pairs_manage" on doubles_pairs;
create policy "doubles_pairs_manage" on doubles_pairs
  for all using (public.can_manage_event(event_id));

drop policy if exists "doubles_pairs_select_public" on doubles_pairs;
create policy "doubles_pairs_select_public" on doubles_pairs
  for select using (
    exists (
      select 1 from events e
      where e.id = event_id and e.status in ('open', 'live', 'finished')
    )
  );

drop policy if exists "pair_runs_manage" on pair_runs;
create policy "pair_runs_manage" on pair_runs
  for all using (public.can_manage_event(event_id));

drop policy if exists "pair_runs_select_public" on pair_runs;
create policy "pair_runs_select_public" on pair_runs
  for select using (
    exists (
      select 1 from events e
      where e.id = event_id and e.status in ('live', 'finished')
    )
  );

drop policy if exists "pair_segment_times_manage" on pair_segment_times;
create policy "pair_segment_times_manage" on pair_segment_times
  for all using (
    exists (
      select 1 from pair_runs pr
      where pr.id = pair_run_id and public.can_manage_event(pr.event_id)
    )
  );

drop policy if exists "pair_segment_times_select_public" on pair_segment_times;
create policy "pair_segment_times_select_public" on pair_segment_times
  for select using (
    exists (
      select 1 from pair_runs pr
      join events e on e.id = pr.event_id
      where pr.id = pair_run_id and e.status in ('live', 'finished')
    )
  );

-- Leaderboard view: leitura pública
grant select on leaderboard to anon, authenticated;
