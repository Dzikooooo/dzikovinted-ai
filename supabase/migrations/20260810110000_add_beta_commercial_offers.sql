-- Programme Beta ResellOS (Lot 6+8, audit valide 2026-08-10). Troisieme axe,
-- independant de profiles.program_status/credits_mode (20260810100000) :
-- l'AVANTAGE COMMERCIAL, une notion de facturation Stripe. Cas initial :
-- essai gratuit (trial_period_days) + reduction ponctuelle sur la premiere
-- facture payante (stripe_coupon_id, coupon duration='once' cote Stripe --
-- voir create-checkout-session/handler.ts Lot 7, aucune logique maison de
-- "mois numero 2", Stripe gere la transition trial -> premiere facture).
--
-- Une seule offre par utilisateur (unique(user_id)) -- l'Admin "prepare"
-- une offre (etat pending), create-checkout-session la "consomme" de facon
-- atomique au moment du Checkout (etat applied). 'expired' permet a
-- l'Admin d'annuler une offre pending sans supprimer la ligne (historique).
--
-- RLS activee, ZERO policy pour authenticated/anon (deny-by-default) -- ni
-- lecture ni ecriture directe. Seuls des chemins prives touchent cette
-- table : les RPC admin_* (SECURITY DEFINER, is_admin()) et les RPC
-- claim_/release_commercial_offer (service_role uniquement, appelees par
-- create-checkout-session, meme discipline que reserve_checkout_slot/
-- release_checkout_reservation dans 20260809100000).

create table if not exists public.beta_commercial_offers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  trial_period_days integer not null default 0 check (trial_period_days >= 0),
  stripe_coupon_id text,
  status text not null default 'pending' check (status in ('pending', 'applied', 'expired')),
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

alter table public.beta_commercial_offers enable row level security;

-- Seule exception au deny-by-default : un admin doit pouvoir VOIR l'etat de
-- l'offre d'un utilisateur dans sa fiche (AdminUsersPage.tsx, Lot 5) --
-- meme precedent que "admins can view all profiles" (20260804120000). Un
-- utilisateur standard n'obtient toujours aucun acces (aucune policy pour
-- lui, is_admin() renvoie false sur sa propre session).
drop policy if exists "admins can view all commercial offers" on public.beta_commercial_offers;
create policy "admins can view all commercial offers"
  on public.beta_commercial_offers for select
  to authenticated
  using (public.is_admin());

-- ─── RPC admin : preparer/mettre a jour l'offre d'un utilisateur ──────────
-- Upsert explicite plutot que INSERT seul : permet a l'Admin de corriger
-- une offre encore pending (ex. ajuster trial_period_days) sans creer une
-- deuxieme ligne (bloque de toute facon par unique(user_id)). Ne touche
-- jamais une offre deja 'applied' -- une offre consommee ne doit plus
-- pouvoir etre modifiee retroactivement.
create or replace function public.admin_prepare_commercial_offer(
  p_user_id uuid,
  p_trial_period_days integer,
  p_stripe_coupon_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  if p_trial_period_days < 0 then
    raise exception 'invalid trial_period_days';
  end if;

  insert into public.beta_commercial_offers (user_id, trial_period_days, stripe_coupon_id, status, created_at, applied_at)
  values (p_user_id, p_trial_period_days, nullif(trim(p_stripe_coupon_id), ''), 'pending', now(), null)
  on conflict (user_id) do update
    set trial_period_days = excluded.trial_period_days,
        stripe_coupon_id = excluded.stripe_coupon_id,
        status = 'pending',
        applied_at = null
  where public.beta_commercial_offers.status != 'applied';
end;
$$;

revoke execute on function public.admin_prepare_commercial_offer(uuid, integer, text) from anon;
revoke execute on function public.admin_prepare_commercial_offer(uuid, integer, text) from public;
grant execute on function public.admin_prepare_commercial_offer(uuid, integer, text) to authenticated;

-- ─── RPC admin : annuler une offre encore pending ─────────────────────────
create or replace function public.admin_expire_commercial_offer(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  update beta_commercial_offers
  set status = 'expired'
  where user_id = p_user_id and status = 'pending';
end;
$$;

revoke execute on function public.admin_expire_commercial_offer(uuid) from anon;
revoke execute on function public.admin_expire_commercial_offer(uuid) from public;
grant execute on function public.admin_expire_commercial_offer(uuid) to authenticated;

-- ─── RPC service_role : reclamer l'offre au moment du Checkout ───────────
-- UPDATE...WHERE...RETURNING atomique (meme idiome que reserve_credit /
-- reserve_checkout_slot) : Postgres verrouille la ligne pendant
-- l'evaluation de la clause WHERE, deux appels concurrents pour le meme
-- user_id serialisent reellement -- un seul peut faire transitionner
-- pending -> applied, l'autre trouve 0 ligne. Combine a la reservation
-- deja existante de reserve_checkout_slot (5 minutes, meme fonction
-- appelante), ce qui exclut par construction toute double consommation de
-- l'offre par deux Checkout Sessions concurrentes du meme utilisateur.
create or replace function public.claim_commercial_offer(p_user_id uuid)
returns table (trial_period_days integer, stripe_coupon_id text)
language sql
security definer
set search_path = public
as $$
  update public.beta_commercial_offers
  set status = 'applied', applied_at = now()
  where user_id = p_user_id and status = 'pending'
  returning beta_commercial_offers.trial_period_days, beta_commercial_offers.stripe_coupon_id;
$$;

revoke all on function public.claim_commercial_offer(uuid) from public, anon, authenticated;
grant execute on function public.claim_commercial_offer(uuid) to service_role;

-- ─── RPC service_role : liberer l'offre si le Checkout echoue apres coup ──
-- Symetrique de release_checkout_reservation : appelee dans le meme bloc
-- catch que releaseCheckoutSlot si Stripe echoue APRES claim_commercial_offer
-- (session.create() leve, pas de session.url, upsert subscriptions echoue)
-- -- remet l'offre en pending pour un retry immediat au lieu de la perdre.
create or replace function public.release_commercial_offer(p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.beta_commercial_offers
  set status = 'pending', applied_at = null
  where user_id = p_user_id and status = 'applied';
$$;

revoke all on function public.release_commercial_offer(uuid) from public, anon, authenticated;
grant execute on function public.release_commercial_offer(uuid) to service_role;
