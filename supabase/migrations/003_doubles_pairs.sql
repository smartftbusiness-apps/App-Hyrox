-- Duplas Hyrox — tabela separada + corridas e tempos por estação

-- Dupla: dois atletas, um bib, uma categoria Doubles
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

-- Liga atletas à dupla (espelha pairId no app)
alter table athletes
  add column if not exists pair_id uuid references doubles_pairs(id) on delete set null;

-- Bib único por atleta só quando não está em dupla; bib da dupla fica em doubles_pairs
alter table athletes drop constraint if exists athletes_event_id_bib_number_key;
create unique index if not exists idx_athletes_event_bib_singles
  on athletes(event_id, bib_number)
  where pair_id is null and bib_number > 0;

-- Prova da dupla (espelha athlete_runs)
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

-- Tempo por segmento da dupla (espelha segment_times)
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
create index if not exists idx_doubles_pairs_event on doubles_pairs(event_id);
create index if not exists idx_doubles_pairs_category on doubles_pairs(category_id);
create index if not exists idx_athletes_pair on athletes(pair_id);
create index if not exists idx_pair_runs_event on pair_runs(event_id);
create index if not exists idx_pair_runs_pair on pair_runs(pair_id);
create index if not exists idx_pair_segment_times_run on pair_segment_times(pair_run_id);

-- updated_at automático
drop trigger if exists doubles_pairs_updated_at on doubles_pairs;
create trigger doubles_pairs_updated_at
  before update on doubles_pairs
  for each row execute function public.set_updated_at();

drop trigger if exists pair_runs_updated_at on pair_runs;
create trigger pair_runs_updated_at
  before update on pair_runs
  for each row execute function public.set_updated_at();

-- RLS
alter table doubles_pairs enable row level security;
alter table pair_runs enable row level security;
alter table pair_segment_times enable row level security;

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

-- Ranking: singles + duplas
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

grant select on leaderboard to anon, authenticated;
