-- Phase B (multi-comptes) : garantit qu'un seul compte Vinted peut etre
-- marque par defaut par utilisateur, et fournit une RPC atomique pour
-- changer ce compte par defaut (evite une fenetre ou deux comptes seraient
-- "is_default = true" simultanement si un update partiel echouait).

create unique index if not exists vinted_accounts_one_default_per_user
  on vinted_accounts (user_id) where is_default;

create or replace function set_default_vinted_account(target_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from vinted_accounts where id = target_account_id and user_id = auth.uid()
  ) then
    raise exception 'Compte introuvable';
  end if;

  update vinted_accounts set is_default = false where user_id = auth.uid() and is_default = true;
  update vinted_accounts set is_default = true, updated_at = now() where id = target_account_id;
end;
$$;

grant execute on function set_default_vinted_account(uuid) to authenticated;
