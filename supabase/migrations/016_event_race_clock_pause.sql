-- Pausa e acumulado do cronômetro total compartilhado
-- Rodar no SQL Editor do Supabase se o MCP estiver read-only.

alter table public.events
  add column if not exists race_paused_at timestamptz;

alter table public.events
  add column if not exists race_pause_accum_ms bigint not null default 0;

notify pgrst, 'reload schema';
