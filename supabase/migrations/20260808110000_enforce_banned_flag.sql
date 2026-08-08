-- Enforce banned server-side (audit beta 2026-08-08, P1-B). Jusqu'ici
-- `profiles.banned` n'etait verifie que cote client (AuthContext.fetchProfile
-- deconnecte la session des qu'il le detecte, voir 20260804120000) : un JWT
-- deja emis reste cryptographiquement valide jusqu'a son expiration naturelle
-- (jusqu'a 1h), et supabase.auth.signOut() ne le revoque pas retroactivement
-- cote Postgres. Un compte banni gardant son token (devtools, appel direct a
-- l'API REST) pouvait donc continuer a lire/ecrire ses donnees pendant cette
-- fenetre, malgre l'UI qui l'avait deja "deconnecte".
--
-- Perimetre retenu (donnees/actions produit "protegees") : listings,
-- expenses, vinted_accounts, action_log(+entries), listing_metric_snapshots,
-- listing_recommendation_log, opportunity_favourites, watchlist (lignes
-- perso uniquement), listing_skus, message_templates, subscriptions, usage.
--
-- Explicitement LAISSE DE COTE (decision produit, pas un oubli) :
--   - profiles.select_own_profile : doit rester lisible sans condition,
--     sinon fetchProfile() recevrait `data: null` pour un compte banni et ne
--     pourrait plus jamais afficher l'ecran "compte banni" (le mecanisme de
--     detection cote client depend de pouvoir lire banned=true).
--   - community_content/roadmap_items/polls/suggestions/support_tickets/
--     ticket_messages/notifications : surfaces sociales/support, pas des
--     donnees business protegees -- un compte banni doit au contraire
--     pouvoir garder acces a support_tickets pour contester le bannissement.
--   - credit_reservations : deja deny-all pour authenticated (aucune policy),
--     rien a faire.

create or replace function public.is_banned()
 returns boolean
 language sql
 stable
 security definer
 set search_path = public
as $function$
  select coalesce((select banned from public.profiles where id = auth.uid()), false);
$function$;

revoke execute on function public.is_banned() from anon;
revoke execute on function public.is_banned() from public;
grant execute on function public.is_banned() to authenticated;

-- ─── listings ───────────────────────────────────────────────────────────────
-- 4 policies decouvertes en production (verifie via pg_policy le
-- 2026-08-08, pendant le test rollback-wrapped de cette migration) SANS
-- trace dans aucun fichier de migration -- creees hors du repo, probablement
-- via le dashboard Supabase. Doublons fonctionnels exacts des policies
-- "officielles" ci-dessous (meme USING/CHECK, mais sans la condition banned
-- ET scopees PUBLIC au lieu de authenticated). Sans ce DROP, elles auraient
-- continue a autoriser silencieusement un compte banni (policies RLS
-- permissives combinees en OR -- une seule policy qui laisse passer suffit).
-- Confirme sans danger a supprimer : strictement redondantes avec
-- select_own_listings/insert_own_listings/update_own_listings/
-- delete_own_listings, aucune perte d'acces legitime.
drop policy if exists "Users can view their own listings" on listings;
drop policy if exists "Users can insert their own listings" on listings;
drop policy if exists "Users can update their own listings" on listings;
drop policy if exists "Users can delete their own listings" on listings;

drop policy if exists "select_own_listings" on listings;
create policy "select_own_listings" on listings for select
  to authenticated using (auth.uid() = user_id and not public.is_banned());

drop policy if exists "insert_own_listings" on listings;
create policy "insert_own_listings" on listings for insert
  to authenticated with check (auth.uid() = user_id and not public.is_banned());

drop policy if exists "update_own_listings" on listings;
create policy "update_own_listings" on listings for update
  to authenticated using (auth.uid() = user_id and not public.is_banned())
  with check (auth.uid() = user_id and not public.is_banned());

drop policy if exists "delete_own_listings" on listings;
create policy "delete_own_listings" on listings for delete
  to authenticated using (auth.uid() = user_id and not public.is_banned());

-- ─── expenses ───────────────────────────────────────────────────────────────

drop policy if exists "select_own_expenses" on expenses;
create policy "select_own_expenses" on expenses for select
  to authenticated using (auth.uid() = user_id and not public.is_banned());

drop policy if exists "insert_own_expenses" on expenses;
create policy "insert_own_expenses" on expenses for insert
  to authenticated with check (auth.uid() = user_id and not public.is_banned());

drop policy if exists "update_own_expenses" on expenses;
create policy "update_own_expenses" on expenses for update
  to authenticated using (auth.uid() = user_id and not public.is_banned())
  with check (auth.uid() = user_id and not public.is_banned());

drop policy if exists "delete_own_expenses" on expenses;
create policy "delete_own_expenses" on expenses for delete
  to authenticated using (auth.uid() = user_id and not public.is_banned());

-- ─── vinted_accounts ────────────────────────────────────────────────────────

drop policy if exists "select_own_vinted_accounts" on vinted_accounts;
create policy "select_own_vinted_accounts" on vinted_accounts for select
  to authenticated using (auth.uid() = user_id and not public.is_banned());

drop policy if exists "insert_own_vinted_accounts" on vinted_accounts;
create policy "insert_own_vinted_accounts" on vinted_accounts for insert
  to authenticated with check (auth.uid() = user_id and not public.is_banned());

drop policy if exists "update_own_vinted_accounts" on vinted_accounts;
create policy "update_own_vinted_accounts" on vinted_accounts for update
  to authenticated using (auth.uid() = user_id and not public.is_banned())
  with check (auth.uid() = user_id and not public.is_banned());

drop policy if exists "delete_own_vinted_accounts" on vinted_accounts;
create policy "delete_own_vinted_accounts" on vinted_accounts for delete
  to authenticated using (auth.uid() = user_id and not public.is_banned());

-- ─── action_log ─────────────────────────────────────────────────────────────

drop policy if exists "select_own_action_log" on action_log;
create policy "select_own_action_log" on action_log for select
  to authenticated using (auth.uid() = user_id and not public.is_banned());

drop policy if exists "insert_own_action_log" on action_log;
create policy "insert_own_action_log" on action_log for insert
  to authenticated with check (
    auth.uid() = user_id
    and not public.is_banned()
    and (vinted_account_id is null or vinted_account_id in (select id from vinted_accounts where user_id = auth.uid()))
    and (listing_id is null or listing_id in (select id from listings where user_id = auth.uid()))
  );

drop policy if exists "update_own_action_log" on action_log;
create policy "update_own_action_log" on action_log for update
  to authenticated using (auth.uid() = user_id and not public.is_banned())
  with check (auth.uid() = user_id and not public.is_banned());

-- ─── action_log_entries ─────────────────────────────────────────────────────

drop policy if exists "select_own_action_log_entries" on action_log_entries;
create policy "select_own_action_log_entries" on action_log_entries for select
  to authenticated using (action_id in (select id from action_log where user_id = auth.uid()) and not public.is_banned());

drop policy if exists "insert_own_action_log_entries" on action_log_entries;
create policy "insert_own_action_log_entries" on action_log_entries for insert
  to authenticated with check (action_id in (select id from action_log where user_id = auth.uid()) and not public.is_banned());

-- ─── listing_metric_snapshots ───────────────────────────────────────────────

drop policy if exists "select_own_listing_metric_snapshots" on listing_metric_snapshots;
create policy "select_own_listing_metric_snapshots" on listing_metric_snapshots for select
  to authenticated using (listing_id in (select id from listings where user_id = auth.uid()) and not public.is_banned());

drop policy if exists "insert_own_listing_metric_snapshots" on listing_metric_snapshots;
create policy "insert_own_listing_metric_snapshots" on listing_metric_snapshots for insert
  to authenticated with check (listing_id in (select id from listings where user_id = auth.uid()) and not public.is_banned());

-- ─── listing_recommendation_log ─────────────────────────────────────────────

drop policy if exists "select_own_listing_recommendation_log" on listing_recommendation_log;
create policy "select_own_listing_recommendation_log" on listing_recommendation_log for select
  to authenticated using (auth.uid() = user_id and not public.is_banned());

drop policy if exists "insert_own_listing_recommendation_log" on listing_recommendation_log;
create policy "insert_own_listing_recommendation_log" on listing_recommendation_log for insert
  to authenticated with check (
    auth.uid() = user_id
    and not public.is_banned()
    and listing_id in (select id from listings where user_id = auth.uid())
  );

drop policy if exists "update_own_listing_recommendation_log" on listing_recommendation_log;
create policy "update_own_listing_recommendation_log" on listing_recommendation_log for update
  to authenticated using (auth.uid() = user_id and not public.is_banned())
  with check (
    auth.uid() = user_id
    and not public.is_banned()
    and listing_id in (select id from listings where user_id = auth.uid())
  );

-- ─── opportunity_favourites ─────────────────────────────────────────────────

drop policy if exists "users can read own favourites" on opportunity_favourites;
create policy "users can read own favourites" on opportunity_favourites
  for select to authenticated using (auth.uid() = user_id and not public.is_banned());

drop policy if exists "users can insert own favourites" on opportunity_favourites;
create policy "users can insert own favourites" on opportunity_favourites
  for insert to authenticated with check (auth.uid() = user_id and not public.is_banned());

drop policy if exists "users can delete own favourites" on opportunity_favourites;
create policy "users can delete own favourites" on opportunity_favourites
  for delete to authenticated using (auth.uid() = user_id and not public.is_banned());

-- ─── watchlist (lignes perso uniquement -- les lignes plateforme user_id is
--     null restent lisibles par tous, ce ne sont pas des donnees du compte
--     banni) ────────────────────────────────────────────────────────────────

drop policy if exists "read own or platform watchlist" on watchlist;
create policy "read own or platform watchlist" on watchlist
  for select to authenticated using ((auth.uid() = user_id and not public.is_banned()) or user_id is null);

drop policy if exists "insert own watchlist" on watchlist;
create policy "insert own watchlist" on watchlist
  for insert to authenticated with check (auth.uid() = user_id and not public.is_banned());

drop policy if exists "update own watchlist" on watchlist;
create policy "update own watchlist" on watchlist
  for update to authenticated using (auth.uid() = user_id and not public.is_banned())
  with check (auth.uid() = user_id and not public.is_banned());

drop policy if exists "delete own watchlist" on watchlist;
create policy "delete own watchlist" on watchlist
  for delete to authenticated using (auth.uid() = user_id and not public.is_banned());

-- ─── listing_skus (select uniquement -- les ecritures passent par les RPC
--     ci-dessous) ──────────────────────────────────────────────────────────

drop policy if exists "Users can view their own sku registry" on public.listing_skus;
create policy "Users can view their own sku registry"
  on public.listing_skus for select
  using (auth.uid() = user_id and not public.is_banned());

-- ─── message_templates ──────────────────────────────────────────────────────

drop policy if exists "users can read own message templates" on message_templates;
create policy "users can read own message templates" on message_templates
  for select to authenticated using (auth.uid() = user_id and not public.is_banned());

drop policy if exists "users can insert own message templates" on message_templates;
create policy "users can insert own message templates" on message_templates
  for insert to authenticated with check (auth.uid() = user_id and not public.is_banned());

drop policy if exists "users can update own message templates" on message_templates;
create policy "users can update own message templates" on message_templates
  for update to authenticated using (auth.uid() = user_id and not public.is_banned())
  with check (auth.uid() = user_id and not public.is_banned());

drop policy if exists "users can delete own message templates" on message_templates;
create policy "users can delete own message templates" on message_templates
  for delete to authenticated using (auth.uid() = user_id and not public.is_banned());

-- ─── subscriptions (select uniquement -- write deja revoke pour authenticated
--     depuis 20260711090000) ─────────────────────────────────────────────────

drop policy if exists "select_own_subscriptions" on subscriptions;
create policy "select_own_subscriptions" on subscriptions for select
  to authenticated using (auth.uid() = user_id and not public.is_banned());

-- ─── usage (update deja vestigial -- revoke table-level, cf. 20260711091500 --
--     mais select/insert/delete restent des policies RLS actives) ───────────

drop policy if exists "select_own_usage" on usage;
create policy "select_own_usage" on usage for select
  to authenticated using (auth.uid() = user_id and not public.is_banned());

drop policy if exists "insert_own_usage" on usage;
create policy "insert_own_usage" on usage for insert
  to authenticated with check (auth.uid() = user_id and not public.is_banned());

drop policy if exists "delete_own_usage" on usage;
create policy "delete_own_usage" on usage for delete
  to authenticated using (auth.uid() = user_id and not public.is_banned());

-- ─── RPC SECURITY DEFINER qui bypassent RLS -- doivent verifier is_banned()
--     elles-memes, sinon le blocage ci-dessus ne suffit pas. Admin RPCs
--     (admin_set_user_banned/admin_set_user_plan) exclues : elles agissent
--     sur un AUTRE compte (celui qu'on bannit/gere), pas sur l'appelant. ────

create or replace function set_default_vinted_account(target_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_banned() then
    raise exception 'Compte suspendu';
  end if;

  if not exists (
    select 1 from vinted_accounts where id = target_account_id and user_id = auth.uid()
  ) then
    raise exception 'Compte introuvable';
  end if;

  update vinted_accounts set is_default = false where user_id = auth.uid() and is_default = true;
  update vinted_accounts set is_default = true, updated_at = now() where id = target_account_id;
end;
$$;

create or replace function public.allocate_sku(p_user_id uuid, p_listing_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_sku integer;
  max_taken integer;
  next_sku integer;
begin
  if auth.uid() is null or auth.uid() != p_user_id then
    raise exception 'not authorized';
  end if;
  if public.is_banned() then
    raise exception 'Compte suspendu';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  select sku into existing_sku
  from listing_skus
  where listing_id = p_listing_id and status = 'active';
  if existing_sku is not null then
    return existing_sku;
  end if;

  select coalesce(max(sku), 0) into max_taken
  from listing_skus
  where user_id = p_user_id and status = 'active';

  select min(candidate) into next_sku
  from generate_series(1, max_taken + 1) as candidate
  where not exists (
    select 1 from listing_skus
    where user_id = p_user_id and sku = candidate and status = 'active'
  );

  insert into listing_skus (user_id, sku, listing_id, status)
  values (p_user_id, next_sku, p_listing_id, 'active');

  return next_sku;
end;
$$;

create or replace function public.validate_sku_consistency(p_user_id uuid)
returns table (issue_type text, listing_id uuid, detail text)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if auth.uid() is null or auth.uid() != p_user_id then
    raise exception 'not authorized';
  end if;
  if public.is_banned() then
    raise exception 'Compte suspendu';
  end if;

  return query
  select 'missing_sku'::text, l.id, l.title
  from listings l
  where l.user_id = p_user_id
    and l.status <> 'vendu' and l.vinted_status is distinct from 'deleted'
    and not exists (select 1 from listing_skus s where s.listing_id = l.id and s.status = 'active')

  union all

  select 'denormalized_mismatch'::text, l.id,
    format('listings.sku=%s registre=%s', l.sku, s.sku)
  from listings l
  join listing_skus s on s.listing_id = l.id and s.status = 'active'
  where l.user_id = p_user_id and l.sku is distinct from s.sku

  union all

  select 'title_has_sku_suffix'::text, l.id, l.title
  from listings l
  where l.user_id = p_user_id and l.title ~ '#\d+\s*$'

  union all

  select 'duplicate_active_sku'::text, l.id, format('sku=%s partage', s.sku)
  from listing_skus s
  join (
    select user_id, sku from listing_skus
    where status = 'active' group by user_id, sku having count(*) > 1
  ) d on d.user_id = s.user_id and d.sku = s.sku
  where s.status = 'active' and s.user_id = p_user_id;
end;
$$;

create or replace function public.repair_sku_inconsistencies(p_user_id uuid)
returns table (action text, listing_id uuid, detail text)
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  new_sku integer;
begin
  if auth.uid() is null or auth.uid() != p_user_id then
    raise exception 'not authorized';
  end if;
  if public.is_banned() then
    raise exception 'Compte suspendu';
  end if;

  for rec in
    select id, title from listings
    where user_id = p_user_id and title ~ '#\d+\s*$'
  loop
    update listings
    set title = regexp_replace(rec.title, '(\s*#\d+\s*)+$', '')
    where id = rec.id;
    action := 'title_cleaned'; listing_id := rec.id; detail := rec.title;
    return next;
  end loop;

  for rec in
    select l.id from listings l
    where l.user_id = p_user_id
      and l.status <> 'vendu' and l.vinted_status is distinct from 'deleted'
      and not exists (select 1 from listing_skus s where s.listing_id = l.id and s.status = 'active')
  loop
    new_sku := public.allocate_sku(p_user_id, rec.id);
    update listings set sku = new_sku where id = rec.id;
    action := 'sku_allocated'; listing_id := rec.id; detail := new_sku::text;
    return next;
  end loop;

  for rec in
    select l.id, s.sku from listings l
    join listing_skus s on s.listing_id = l.id and s.status = 'active'
    where l.user_id = p_user_id and l.sku is distinct from s.sku
  loop
    update listings set sku = rec.sku where id = rec.id;
    action := 'denormalized_resynced'; listing_id := rec.id; detail := rec.sku::text;
    return next;
  end loop;

  for rec in
    select l.id, s.sku from listing_skus s
    join listings l on l.id = s.listing_id
    join (
      select user_id, sku from listing_skus
      where status = 'active' group by user_id, sku having count(*) > 1
    ) d on d.user_id = s.user_id and d.sku = s.sku
    where s.status = 'active' and s.user_id = p_user_id
  loop
    action := 'duplicate_flagged_manual_review'; listing_id := rec.id; detail := rec.sku::text;
    return next;
  end loop;
end;
$$;
