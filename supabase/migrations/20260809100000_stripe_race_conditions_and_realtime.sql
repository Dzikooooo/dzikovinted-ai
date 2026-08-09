-- Corrige 3 des risques P1 releves par l'audit pre-lancement Stripe LIVE
-- (2026-08-09) : double Checkout concurrent (P1-1), ecriture webhook non
-- atomique (P1-2), et synchronisation frontend reactive (P1-6, nécessite
-- que "profiles" soit dans la publication Realtime pour que le canal ajoute
-- dans AuthContext.tsx recoive des evenements).
--
-- Aucune donnee existante modifiee : subscriptions est deja verifiee vide
-- en production a ce stade du projet (aucun vrai client Stripe), et toutes
-- les operations ci-dessous sont additives (nouvelle colonne nullable,
-- nouvelles fonctions).

-- ─── P1-1 : reservation atomique d'un slot de Checkout ────────────────────
-- Nouvelle colonne nullable -- ne casse aucun utilisateur existant. Marque
-- "une creation de Checkout Session est en cours pour cet utilisateur",
-- avec une duree de vie courte (5 minutes, voir la fonction ci-dessous)
-- pour permettre un retry immediat apres un echec reseau/Stripe cote
-- edge function (la fonction release_checkout_reservation ci-dessous fait
-- ce retry immediat explicitement, sans attendre les 5 minutes).
alter table public.subscriptions
  add column if not exists checkout_reserved_at timestamptz;

-- Reservation atomique : un seul UPDATE conditionnel (ON CONFLICT ... DO
-- UPDATE ... WHERE ...) au lieu d'un SELECT puis d'une decision cote
-- application. Postgres verrouille la ligne cible pendant toute
-- l'evaluation de cette clause WHERE -- deux appels concurrents pour le
-- meme user_id serialisent reellement : le second n'evalue sa condition
-- qu'apres le commit du premier, contre l'etat DEJA A JOUR de la ligne.
-- C'est cette serialisation native de Postgres sur UPSERT qui garantit
-- l'absence de race, pas un verrou applicatif manuel.
--
-- Refuse la reservation si :
-- - un abonnement est deja actif/trialing/past_due (deja abonne) ;
-- - une reservation encore fraiche existe (< 5 minutes, une autre requete
--   est deja en train de creer une Checkout Session pour ce user).
create or replace function public.reserve_checkout_slot(p_user_id uuid)
returns table (reserved boolean, reason text, stripe_customer_id text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reserved boolean := false;
  v_customer_id text;
begin
  insert into public.subscriptions (user_id, checkout_reserved_at, updated_at)
  values (p_user_id, now(), now())
  on conflict (user_id) do update
    set checkout_reserved_at = now(),
        updated_at = now()
  where public.subscriptions.status is distinct from 'active'
    and public.subscriptions.status is distinct from 'trialing'
    and public.subscriptions.status is distinct from 'past_due'
    and (
      public.subscriptions.checkout_reserved_at is null
      or public.subscriptions.checkout_reserved_at < now() - interval '5 minutes'
    )
  returning true, public.subscriptions.stripe_customer_id into v_reserved, v_customer_id;

  if v_reserved then
    return query select true, 'reserved'::text, v_customer_id;
    return;
  end if;

  return query
    select
      false,
      case
        when s.status in ('active', 'trialing', 'past_due') then 'already_subscribed'
        else 'checkout_in_progress'
      end,
      s.stripe_customer_id
    from public.subscriptions s
    where s.user_id = p_user_id;
end;
$$;

-- Retire une reservation avant son expiration naturelle -- appelee par
-- create-checkout-session si la creation Stripe echoue APRES la
-- reservation, pour permettre un retry immediat plutot que d'attendre 5
-- minutes.
create or replace function public.release_checkout_reservation(p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.subscriptions
  set checkout_reserved_at = null, updated_at = now()
  where user_id = p_user_id;
$$;

-- Ni l'une ni l'autre ne verifient auth.uid() = p_user_id (contrairement a
-- decrement_credit/refund_credit) : elles ne sont jamais exposees a
-- authenticated/anon, appelees exclusivement par create-checkout-session en
-- service_role (qui a deja verifie le JWT en amont via
-- authenticateBillingUser, meme decoupage de confiance que le reste du
-- chantier Stripe -- voir stripe-webhook qui ecrit profiles.plan sans RPC
-- dediee non plus).
revoke all on function public.reserve_checkout_slot(uuid) from public, anon, authenticated;
grant execute on function public.reserve_checkout_slot(uuid) to service_role;

revoke all on function public.release_checkout_reservation(uuid) from public, anon, authenticated;
grant execute on function public.release_checkout_reservation(uuid) to service_role;

-- ─── P1-2 : ecriture webhook atomique (anti-desordre garanti a l'ecriture) ─
-- Remplace le SELECT stripe_event_created_at + upsert (non atomique,
-- handler.ts avant ce lot) par un seul UPSERT dont la clause WHERE relit
-- stripe_event_created_at AU MOMENT DE L'ECRITURE, sous le verrou de ligne
-- pris par ON CONFLICT. Deux evenements traites en parallele pour le meme
-- utilisateur serialisent reellement sur cette ligne ; celui qui commit en
-- second reevalue la condition contre l'etat DEJA ECRIT par le premier --
-- l'etat final correspond donc toujours a stripe_event_created_at le plus
-- recent, quel que soit l'ordre de traitement ou de commit reel des deux
-- transactions. stripe_event_created_at reste l'unique reference d'ordre
-- (jamais updated_at, ecrit ici uniquement a titre informatif).
--
-- Idempotence sur rejeu : un evenement dont le timestamp est EGAL a la
-- valeur deja stockee passe la condition "<=" et reecrit le meme etat --
-- aucun changement incoherent, cf. tests eventOrdering/handler.
create or replace function public.apply_subscription_event(
  p_user_id uuid,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_status text,
  p_cancel_at_period_end boolean,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_stripe_event_created_at timestamptz,
  p_now timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_applied boolean := false;
begin
  insert into public.subscriptions (
    user_id, stripe_customer_id, stripe_subscription_id, status,
    cancel_at_period_end, current_period_start, current_period_end,
    stripe_event_created_at, checkout_reserved_at, updated_at
  )
  values (
    p_user_id, p_stripe_customer_id, p_stripe_subscription_id, p_status,
    p_cancel_at_period_end, p_current_period_start, p_current_period_end,
    p_stripe_event_created_at, null, p_now
  )
  on conflict (user_id) do update
    set stripe_customer_id = excluded.stripe_customer_id,
        stripe_subscription_id = excluded.stripe_subscription_id,
        status = excluded.status,
        cancel_at_period_end = excluded.cancel_at_period_end,
        current_period_start = excluded.current_period_start,
        current_period_end = excluded.current_period_end,
        stripe_event_created_at = excluded.stripe_event_created_at,
        checkout_reserved_at = null,
        updated_at = excluded.updated_at
  where public.subscriptions.stripe_event_created_at is null
     or public.subscriptions.stripe_event_created_at <= excluded.stripe_event_created_at
  returning true into v_applied;

  return coalesce(v_applied, false);
end;
$$;

revoke all on function public.apply_subscription_event(
  uuid, text, text, text, boolean, timestamptz, timestamptz, timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function public.apply_subscription_event(
  uuid, text, text, text, boolean, timestamptz, timestamptz, timestamptz, timestamptz
) to service_role;

-- ─── P1-6 : synchronisation frontend reactive ─────────────────────────────
-- Necessaire pour que le canal Realtime ajoute dans AuthContext.tsx
-- (postgres_changes UPDATE sur profiles, filtre id=eq.<user>) recoive
-- effectivement des evenements -- meme mecanisme deja en place pour
-- action_log/action_log_entries (20260710151000). Realtime applique RLS a
-- la connexion authentifiee : un utilisateur ne recoit que les evenements
-- sur SA PROPRE ligne (policy "select_own_profile" deja en place, jamais
-- gardee par is_banned() -- necessaire pour que le flux de bannissement
-- lui-meme fonctionne), aucune fuite inter-utilisateur possible via ce
-- canal.
alter publication supabase_realtime add table public.profiles;
