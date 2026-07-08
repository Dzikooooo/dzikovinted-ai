-- accounts avait select/insert/delete mais pas update : impossible de renommer un compte
drop policy if exists "update_own_accounts" on accounts;

create policy "update_own_accounts" on accounts for update
  to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
