-- Percurso e baterias do evento (organizador → juízes).
-- Rodar no SQL Editor do Supabase.

alter table public.events
  add column if not exists course_layout jsonb not null default '{}'::jsonb;

comment on column public.events.course_layout is
  'Layout do percurso e baterias: { segments: Segment[], heats: EventHeat[] }';

notify pgrst, 'reload schema';
