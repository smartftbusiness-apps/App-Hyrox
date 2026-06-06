-- App Hyrox — schema inicial
-- Rode no Supabase: SQL Editor → New query → colar e executar

-- Extensões
create extension if not exists "pgcrypto";

-- Enums
do $$ begin
  create type event_status as enum ('draft', 'open', 'live', 'finished');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type athlete_status as enum ('registered', 'checked_in', 'racing', 'finished', 'dnf', 'dns');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type segment_type as enum ('run', 'station');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type user_role as enum ('organizer', 'staff', 'viewer');
exception when duplicate_object then null;
end $$;

-- Perfis (ligado ao auth.users do Supabase)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role user_role not null default 'organizer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Templates de percurso
create table if not exists course_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_official_hyrox boolean not null default false,
  segment_count int not null check (segment_count > 0),
  created_at timestamptz not null default now()
);

-- Segmentos do template
create table if not exists segments (
  id uuid primary key default gen_random_uuid(),
  course_template_id uuid not null references course_templates(id) on delete cascade,
  order_index int not null check (order_index > 0),
  type segment_type not null,
  name text not null,
  target_value text not null,
  created_at timestamptz not null default now(),
  unique (course_template_id, order_index)
);

-- Eventos
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references profiles(id) on delete restrict,
  name text not null,
  event_date date not null,
  location text not null,
  timezone text not null default 'America/Sao_Paulo',
  status event_status not null default 'draft',
  course_template_id uuid references course_templates(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Staff do evento (juízes)
create table if not exists event_staff (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);

-- Categorias
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  name text not null,
  division text not null check (division in ('Open', 'Pro', 'Doubles', 'Relay')),
  gender text not null check (gender in ('M', 'F', 'Mixed')),
  created_at timestamptz not null default now(),
  unique (event_id, name)
);

-- Atletas
create table if not exists athletes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  category_id uuid references categories(id) on delete set null,
  name text not null,
  email text,
  bib_number int not null default 0 check (bib_number >= 0),
  partner_name text,
  status athlete_status not null default 'registered',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Duplas Hyrox — dois atletas, um bib, categoria Doubles
create table if not exists doubles_pairs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  category_id uuid not null references categories(id) on delete restrict,
  bib_number int not null check (bib_number > 0),
  athlete1_id uuid not null references athletes(id) on delete cascade,
  athlete2_id uuid not null references athletes(id) on delete cascade,
  team_name text,
  status athlete_status not null default 'registered',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, bib_number),
  unique (event_id, athlete1_id),
  unique (event_id, athlete2_id),
  check (athlete1_id <> athlete2_id)
);

alter table athletes
  add column if not exists pair_id uuid references doubles_pairs(id) on delete set null;

create unique index if not exists idx_athletes_event_bib_singles
  on athletes(event_id, bib_number)
  where pair_id is null and bib_number > 0;

-- Prova do atleta (uma corrida)
create table if not exists athlete_runs (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  wave_number int,
  started_at timestamptz,
  finished_at timestamptz,
  total_ms bigint check (total_ms is null or total_ms >= 0),
  status text not null default 'in_progress' check (status in ('in_progress', 'finished', 'dnf')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tempo por segmento
create table if not exists segment_times (
  id uuid primary key default gen_random_uuid(),
  athlete_run_id uuid not null references athlete_runs(id) on delete cascade,
  segment_id uuid not null references segments(id) on delete restrict,
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms bigint not null check (duration_ms >= 0),
  penalties_ms bigint not null default 0 check (penalties_ms >= 0),
  notes text,
  created_at timestamptz not null default now(),
  unique (athlete_run_id, segment_id)
);

-- Penalidades detalhadas
create table if not exists penalties (
  id uuid primary key default gen_random_uuid(),
  segment_time_id uuid not null references segment_times(id) on delete cascade,
  seconds int not null check (seconds > 0),
  reason_code text not null,
  notes text,
  created_at timestamptz not null default now()
);

-- Prova da dupla
create table if not exists pair_runs (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references doubles_pairs(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  wave_number int,
  started_at timestamptz,
  finished_at timestamptz,
  total_ms bigint check (total_ms is null or total_ms >= 0),
  status text not null default 'in_progress' check (status in ('in_progress', 'finished', 'dnf')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pair_id)
);

-- Tempo por segmento da dupla
create table if not exists pair_segment_times (
  id uuid primary key default gen_random_uuid(),
  pair_run_id uuid not null references pair_runs(id) on delete cascade,
  segment_id uuid not null references segments(id) on delete restrict,
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms bigint not null check (duration_ms >= 0),
  penalties_ms bigint not null default 0 check (penalties_ms >= 0),
  notes text,
  created_at timestamptz not null default now(),
  unique (pair_run_id, segment_id)
);

-- Índices
create index if not exists idx_events_organizer on events(organizer_id);
create index if not exists idx_events_status on events(status);
create index if not exists idx_athletes_event on athletes(event_id);
create index if not exists idx_athletes_category on athletes(category_id);
create index if not exists idx_athlete_runs_event on athlete_runs(event_id);
create index if not exists idx_athlete_runs_athlete on athlete_runs(athlete_id);
create index if not exists idx_segment_times_run on segment_times(athlete_run_id);
create index if not exists idx_segments_template on segments(course_template_id);
create index if not exists idx_doubles_pairs_event on doubles_pairs(event_id);
create index if not exists idx_doubles_pairs_category on doubles_pairs(category_id);
create index if not exists idx_athletes_pair on athletes(pair_id);
create index if not exists idx_pair_runs_event on pair_runs(event_id);
create index if not exists idx_pair_runs_pair on pair_runs(pair_id);
create index if not exists idx_pair_segment_times_run on pair_segment_times(pair_run_id);

-- View de ranking por categoria (singles + duplas)
create or replace view leaderboard as
select
  e.id as event_id,
  c.id as category_id,
  c.name as category_name,
  'athlete'::text as participant_type,
  a.id as participant_id,
  a.name as display_name,
  a.bib_number,
  ar.total_ms,
  ar.finished_at,
  rank() over (
    partition by e.id, c.id
    order by ar.total_ms asc nulls last, ar.finished_at asc nulls last
  ) as rank
from events e
join athletes a on a.event_id = e.id
join categories c on c.id = a.category_id
join athlete_runs ar on ar.athlete_id = a.id
where ar.status = 'finished'
  and ar.total_ms is not null
  and a.status = 'finished'
  and a.pair_id is null
union all
select
  e.id as event_id,
  c.id as category_id,
  c.name as category_name,
  'pair'::text as participant_type,
  dp.id as participant_id,
  coalesce(
    dp.team_name,
    trim(both from a1.name || ' / ' || a2.name)
  ) as display_name,
  dp.bib_number,
  pr.total_ms,
  pr.finished_at,
  rank() over (
    partition by e.id, c.id
    order by pr.total_ms asc nulls last, pr.finished_at asc nulls last
  ) as rank
from events e
join doubles_pairs dp on dp.event_id = e.id
join categories c on c.id = dp.category_id
join athletes a1 on a1.id = dp.athlete1_id
join athletes a2 on a2.id = dp.athlete2_id
join pair_runs pr on pr.pair_id = dp.id
where pr.status = 'finished'
  and pr.total_ms is not null
  and dp.status = 'finished';

-- Trigger: criar profile ao registrar usuário
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Trigger: updated_at automático
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on profiles;
create trigger profiles_updated_at
  before update on profiles
  for each row execute function public.set_updated_at();

drop trigger if exists events_updated_at on events;
create trigger events_updated_at
  before update on events
  for each row execute function public.set_updated_at();

drop trigger if exists athletes_updated_at on athletes;
create trigger athletes_updated_at
  before update on athletes
  for each row execute function public.set_updated_at();

drop trigger if exists athlete_runs_updated_at on athlete_runs;
create trigger athlete_runs_updated_at
  before update on athlete_runs
  for each row execute function public.set_updated_at();

drop trigger if exists doubles_pairs_updated_at on doubles_pairs;
create trigger doubles_pairs_updated_at
  before update on doubles_pairs
  for each row execute function public.set_updated_at();

drop trigger if exists pair_runs_updated_at on pair_runs;
create trigger pair_runs_updated_at
  before update on pair_runs
  for each row execute function public.set_updated_at();
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
-- Seed: template Hyrox oficial (16 segmentos)
-- Seguro para rodar mais de uma vez

insert into course_templates (id, name, is_official_hyrox, segment_count)
values ('00000000-0000-0000-0000-000000000001', 'Hyrox Singles Oficial', true, 16)
on conflict (id) do nothing;

insert into segments (course_template_id, order_index, type, name, target_value) values
  ('00000000-0000-0000-0000-000000000001', 1,  'run',     'Run 1',                '1 km'),
  ('00000000-0000-0000-0000-000000000001', 2,  'station', 'SkiErg',               '1000 m'),
  ('00000000-0000-0000-0000-000000000001', 3,  'run',     'Run 2',                '1 km'),
  ('00000000-0000-0000-0000-000000000001', 4,  'station', 'Sled Push',            '50 m'),
  ('00000000-0000-0000-0000-000000000001', 5,  'run',     'Run 3',                '1 km'),
  ('00000000-0000-0000-0000-000000000001', 6,  'station', 'Sled Pull',            '50 m'),
  ('00000000-0000-0000-0000-000000000001', 7,  'run',     'Run 4',                '1 km'),
  ('00000000-0000-0000-0000-000000000001', 8,  'station', 'Burpee Broad Jumps',   '80 m'),
  ('00000000-0000-0000-0000-000000000001', 9,  'run',     'Run 5',                '1 km'),
  ('00000000-0000-0000-0000-000000000001', 10, 'station', 'Rowing',               '1000 m'),
  ('00000000-0000-0000-0000-000000000001', 11, 'run',     'Run 6',                '1 km'),
  ('00000000-0000-0000-0000-000000000001', 12, 'station', 'Farmers Carry',        '200 m'),
  ('00000000-0000-0000-0000-000000000001', 13, 'run',     'Run 7',                '1 km'),
  ('00000000-0000-0000-0000-000000000001', 14, 'station', 'Sandbag Lunges',       '100 m'),
  ('00000000-0000-0000-0000-000000000001', 15, 'run',     'Run 8',                '1 km'),
  ('00000000-0000-0000-0000-000000000001', 16, 'station', 'Wall Balls',           '100 reps')
on conflict (course_template_id, order_index) do nothing;
