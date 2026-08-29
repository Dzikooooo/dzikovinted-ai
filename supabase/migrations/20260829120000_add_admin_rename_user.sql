-- Renommage d'un compte par un admin (demande produit 2026-08-29, panneau
-- admin). full_name est le SEUL champ que `authenticated` peut ecrire
-- directement sur profiles (20260711090000_lock_billing_columns.sql :
-- `grant update (full_name) on public.profiles to authenticated`), mais la
-- policy "update_own_profile" (20260615080503) reste limitee a
-- `auth.uid() = id` -- un GRANT de colonne ne contourne jamais une policy de
-- LIGNE. Un admin ne peut donc pas renommer un AUTRE compte via un simple
-- `update` client : il lui faut une fonction SECURITY DEFINER dediee, meme
-- discipline que admin_set_user_banned/admin_set_user_plan (verification
-- explicite dans le corps de la fonction, jamais seulement cote client).

create or replace function public.admin_set_user_full_name(p_user_id uuid, p_full_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  if p_full_name is null or length(trim(p_full_name)) = 0 then
    raise exception 'full name cannot be empty';
  end if;
  update profiles set full_name = trim(p_full_name) where id = p_user_id;
end;
$$;

revoke execute on function public.admin_set_user_full_name(uuid, text) from anon;
revoke execute on function public.admin_set_user_full_name(uuid, text) from public;
grant execute on function public.admin_set_user_full_name(uuid, text) to authenticated;
