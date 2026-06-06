-- Busca usuário por e-mail para designar juízes (event_staff)
create or replace function public.lookup_profile_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = public
as $$
  select id from auth.users where lower(email) = lower(trim(p_email)) limit 1;
$$;

grant execute on function public.lookup_profile_id_by_email(text) to authenticated;

-- Grava role do perfil no signup (organizer / staff=judge)
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
