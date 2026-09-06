-- Relógio da prova compartilhado entre organizador e juízes.
-- Rodar no SQL Editor do Supabase se o MCP estiver read-only.

alter table public.events
  add column if not exists race_started_at timestamptz;

alter table public.events replica identity full;
alter table public.athlete_runs replica identity full;
alter table public.pair_runs replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.events;
  exception
    when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.athlete_runs;
  exception
    when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.pair_runs;
  exception
    when duplicate_object then null;
  end;
end $$;

notify pgrst, 'reload schema';
