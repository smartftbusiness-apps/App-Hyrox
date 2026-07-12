-- Organizador define/atualiza a senha do juiz (corrige contas antigas com senha errada)

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

  if not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'organizer'
  ) then
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
