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

-- Trigger: criar profile ao registrar usuário (organizer / staff=judge)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role user_role;
  v_meta text;
begin
  v_meta := coalesce(new.raw_user_meta_data->>'role', 'organizer');
  v_role := case
    when v_meta in ('staff', 'judge') then 'staff'::user_role
    when v_meta = 'viewer' then 'viewer'::user_role
    else 'organizer'::user_role
  end;

  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    v_role
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    role = excluded.role;

  return new;
end;
$$;

-- Busca usuário por e-mail para designar juízes
create or replace function public.lookup_profile_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = public
as $$
  select id from auth.users where lower(email) = lower(trim(p_email)) limit 1;
$$;

grant execute on function public.lookup_profile_id_by_email(text) to authenticated;

-- Helpers RLS (criar antes das RPCs que os referenciam)
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

-- Conta organizadora (perfil ou dono de evento)
create or replace function public.is_organizer_account()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'organizer'::user_role
  )
  or exists (
    select 1 from public.events
    where organizer_id = auth.uid()
  );
$$;

grant execute on function public.is_organizer_account() to authenticated;

create or replace function public.bootstrap_organizer_profile()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_name text;
  v_meta text;
begin
  if auth.uid() is null then
    raise exception 'Faça login como organizador';
  end if;

  select
    coalesce(nullif(trim(raw_user_meta_data->>'full_name'), ''), ''),
    coalesce(raw_user_meta_data->>'role', 'organizer')
  into v_name, v_meta
  from auth.users
  where id = auth.uid();

  insert into public.profiles (id, full_name, role)
  values (
    auth.uid(),
    v_name,
    case when v_meta in ('staff', 'judge', 'viewer') then 'viewer'::user_role else 'organizer'::user_role end
  )
  on conflict (id) do nothing;

  update public.profiles
  set role = 'organizer'::user_role
  where id = auth.uid()
    and exists (select 1 from public.events e where e.organizer_id = auth.uid());
end;
$$;

grant execute on function public.bootstrap_organizer_profile() to authenticated;

-- Organizador finaliza conta do juiz (perfil staff + e-mail confirmado para login imediato)
create or replace function public.ensure_judge_profile_for_organizer(
  p_user_id uuid,
  p_full_name text default ''
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Faça login como organizador';
  end if;

  perform public.bootstrap_organizer_profile();

  if not public.is_organizer_account() then
    raise exception 'Apenas organizadores podem cadastrar juízes';
  end if;

  insert into public.profiles (id, full_name, role)
  values (
    p_user_id,
    coalesce(nullif(trim(p_full_name), ''), 'Juiz'),
    'staff'::user_role
  )
  on conflict (id) do update set
    full_name = case
      when excluded.full_name <> '' and excluded.full_name <> 'Juiz' then excluded.full_name
      else profiles.full_name
    end,
    role = 'staff'::user_role;
end;
$$;

create or replace function public.confirm_judge_email_for_organizer(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Faça login como organizador';
  end if;

  perform public.bootstrap_organizer_profile();

  if not public.is_organizer_account() then
    raise exception 'Apenas organizadores podem confirmar juízes';
  end if;

  if not exists (
    select 1 from public.profiles where id = p_user_id and role = 'staff'
  ) then
    raise exception 'Conta não é de juiz (staff)';
  end if;

  update auth.users
  set
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    updated_at = now()
  where id = p_user_id;

  return found;
end;
$$;

grant execute on function public.ensure_judge_profile_for_organizer(uuid, text) to authenticated;
grant execute on function public.confirm_judge_email_for_organizer(uuid) to authenticated;

-- Organizador define/atualiza a senha do juiz
create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_judge_password_for_organizer(
  p_user_id uuid,
  p_password text
)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
begin
  if auth.uid() is null then
    raise exception 'Faça login como organizador';
  end if;

  perform public.bootstrap_organizer_profile();

  if not public.is_organizer_account() then
    raise exception 'Apenas organizadores podem definir senha de juízes';
  end if;

  if not exists (
    select 1 from public.profiles where id = p_user_id and role = 'staff'
  ) then
    raise exception 'Conta não é de juiz (staff)';
  end if;

  if p_password is null or length(trim(p_password)) < 6 then
    raise exception 'A senha precisa ter pelo menos 6 caracteres';
  end if;

  update auth.users
  set
    encrypted_password = extensions.crypt(trim(p_password), extensions.gen_salt('bf')),
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    updated_at = now()
  where id = p_user_id;

  if not found then
    raise exception 'Usuário não encontrado';
  end if;
end;
$$;

grant execute on function public.set_judge_password_for_organizer(uuid, text) to authenticated;

-- Lista juízes do evento com e-mail (organizador)
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

-- Eventos designados ao juiz logado
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

-- Juízes já cadastrados pelo organizador (todos os eventos)
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
drop policy if exists "event_staff_organizer_manage" on event_staff;
drop policy if exists "event_staff_select_own" on event_staff;
create policy "event_staff_organizer_manage" on event_staff
  for all using (public.is_event_organizer(event_id));
create policy "event_staff_select_own" on event_staff
  for select using (user_id = auth.uid());

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
