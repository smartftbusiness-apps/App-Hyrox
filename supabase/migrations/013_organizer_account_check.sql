-- Organizador = role organizer no perfil OU dono de algum evento na nuvem

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
