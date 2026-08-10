-- Programme Beta ResellOS (Lot 1+2, audit valide 2026-08-10). Introduit deux
-- notions volontairement independantes -- jamais l'une n'active l'autre :
--
-- 1. profiles.program_status ('standard'|'beta_tester') : une simple
--    ETIQUETTE d'appartenance au programme beta. N'accorde AUCUN privilege
--    par elle-meme (ni credits, ni plan, ni avantage commercial) -- sert
--    uniquement a savoir qui est beta-testeur, pour communication/suivi.
-- 2. profiles.credits_mode ('standard'|'unlimited') : l'ENTITLEMENT reel de
--    consommation de credits. C'est CE champ, et lui seul, que
--    analyze-clothing/index.ts (Lot 3) doit lire pour decider si un appel
--    IA doit reserver/consommer un credit. profiles.credits (le solde
--    reel) n'est jamais modifie ni gonfle par ce mode -- 'unlimited'
--    signifie juste "ne pas decrementer", pas "credits = 999999".
--
-- Le troisieme axe (avantage commercial : essai + reduction Stripe) est une
-- notion de facturation independante -- voir 20260810110000_add_beta_commercial_offers.sql,
-- jamais melangee avec les deux colonnes ci-dessous.

alter table public.profiles
  add column if not exists program_status text not null default 'standard';
alter table public.profiles
  add column if not exists credits_mode text not null default 'standard';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_program_status_check'
  ) then
    alter table public.profiles
      add constraint profiles_program_status_check
      check (program_status in ('standard', 'beta_tester'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'profiles_credits_mode_check'
  ) then
    alter table public.profiles
      add constraint profiles_credits_mode_check
      check (credits_mode in ('standard', 'unlimited'));
  end if;
end $$;

-- Verification explicite (pas d'instruction SQL necessaire) : ces deux
-- colonnes sont deja verrouillees en ecriture directe pour authenticated.
-- 20260711090000_lock_billing_columns.sql applique `REVOKE UPDATE ON
-- public.profiles FROM authenticated` puis `GRANT UPDATE (full_name) TO
-- authenticated` -- un GRANT de colonne n'ouvre QUE cette colonne, le
-- REVOKE de table reste la regle par defaut pour toute autre colonne,
-- existante ou future. Confirme par lecture du systeme de privileges
-- Postgres (information_schema.column_privileges) : aucune ligne
-- authenticated/UPDATE pour program_status ou credits_mode apres cette
-- migration. Seules les RPC SECURITY DEFINER ci-dessous (proprietaire =
-- createur de la fonction, contourne le grant de l'appelant) peuvent les
-- modifier.

-- ─── RPC admin : statut programme (etiquette seule, aucun effet credits) ──
create or replace function public.admin_set_user_program_status(p_user_id uuid, p_program_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  if p_program_status not in ('standard', 'beta_tester') then
    raise exception 'invalid program_status';
  end if;
  update profiles set program_status = p_program_status where id = p_user_id;
end;
$$;

revoke execute on function public.admin_set_user_program_status(uuid, text) from anon;
revoke execute on function public.admin_set_user_program_status(uuid, text) from public;
grant execute on function public.admin_set_user_program_status(uuid, text) to authenticated;

-- ─── RPC admin : mode credits (seul chemin qui influence analyze-clothing) ─
create or replace function public.admin_set_user_credits_mode(p_user_id uuid, p_credits_mode text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  if p_credits_mode not in ('standard', 'unlimited') then
    raise exception 'invalid credits_mode';
  end if;
  update profiles set credits_mode = p_credits_mode where id = p_user_id;
end;
$$;

revoke execute on function public.admin_set_user_credits_mode(uuid, text) from anon;
revoke execute on function public.admin_set_user_credits_mode(uuid, text) from public;
grant execute on function public.admin_set_user_credits_mode(uuid, text) to authenticated;
