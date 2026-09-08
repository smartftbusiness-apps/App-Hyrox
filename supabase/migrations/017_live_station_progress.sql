-- Progresso de estação compartilhado (juiz → organizador).
-- Rodar no SQL Editor do Supabase (MCP está read-only).

alter table public.events
  add column if not exists live_station_progress jsonb not null default '{}'::jsonb;

create table if not exists public.live_station_progress (
  event_id uuid not null references public.events(id) on delete cascade,
  bib integer not null,
  completed_orders int[] not null default '{}',
  current_order int,
  updated_at timestamptz not null default now(),
  primary key (event_id, bib)
);

alter table public.live_station_progress enable row level security;

drop policy if exists "live_station_progress_select" on public.live_station_progress;
create policy "live_station_progress_select"
  on public.live_station_progress for select
  using (true);

drop policy if exists "live_station_progress_write" on public.live_station_progress;
create policy "live_station_progress_write"
  on public.live_station_progress for all
  using (public.can_manage_event(event_id))
  with check (public.can_manage_event(event_id));

create or replace function public.upsert_live_station_progress(
  p_event_id uuid,
  p_bib int,
  p_completed_orders int[],
  p_current_order int
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_progress jsonb;
  v_entry jsonb;
begin
  if p_event_id is null or p_bib is null then
    return;
  end if;
  if auth.uid() is null then
    raise exception 'Faça login para apontar a estação';
  end if;
  if not public.can_manage_event(p_event_id) then
    raise exception 'Sem permissão para apontar este evento';
  end if;

  insert into public.live_station_progress (
    event_id, bib, completed_orders, current_order, updated_at
  )
  values (
    p_event_id,
    p_bib,
    coalesce(p_completed_orders, '{}'),
    p_current_order,
    now()
  )
  on conflict (event_id, bib) do update set
    completed_orders = excluded.completed_orders,
    current_order = excluded.current_order,
    updated_at = now();

  v_entry := jsonb_build_object(
    'completedOrders', to_jsonb(coalesce(p_completed_orders, '{}')),
    'currentOrder', p_current_order
  );

  select coalesce(live_station_progress, '{}'::jsonb) into v_progress
  from public.events
  where id = p_event_id;

  update public.events
  set live_station_progress = coalesce(v_progress, '{}'::jsonb) || jsonb_build_object(p_bib::text, v_entry)
  where id = p_event_id;
end;
$$;

grant execute on function public.upsert_live_station_progress(uuid, int, int[], int) to authenticated;

alter table public.live_station_progress replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'live_station_progress'
  ) then
    execute 'alter publication supabase_realtime add table public.live_station_progress';
  end if;
end $$;

notify pgrst, 'reload schema';
