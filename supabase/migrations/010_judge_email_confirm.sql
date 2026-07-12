-- Organizador finaliza conta do juiz (perfil staff + e-mail confirmado para login imediato)

create or replace function public.ensure_judge_profile_for_organizer(
  p_user_id uuid,
  p_full_name text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Faça login como organizador';
  end if;

  if not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'organizer'
  ) then
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

  if not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'organizer'
  ) then
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
