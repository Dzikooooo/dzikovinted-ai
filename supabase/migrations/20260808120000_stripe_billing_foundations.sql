-- Stripe billing foundations (freeze beta, Lot 1). Prepare public.subscriptions
-- as the durable mirror of Stripe subscription state, written exclusively by
-- service_role from create-checkout-session/stripe-webhook (Lots 2-3, pas
-- encore deployes -- cette migration ne cree aucune donnee, uniquement la
-- forme de la table).
--
-- Aucun changement RLS : "select_own_subscriptions" (lecture seule pour le
-- proprietaire, deja gardee par is_banned() depuis 20260808110000) reste la
-- seule policy. INSERT/UPDATE/DELETE restent revoques pour authenticated
-- depuis 20260711090000_lock_billing_columns.sql -- create-checkout-session
-- et stripe-webhook ecrivent en service_role, qui contourne RLS/grants,
-- exactement comme decrement_credit/refund_credit le font deja pour les
-- credits Gemini.
--
-- Table verifiee vide (0 ligne) le 2026-08-08 avant redaction de cette
-- migration -- scaffolding jamais utilise, les contraintes UNIQUE ci-dessous
-- s'appliquent donc sans aucun risque de violation sur des donnees
-- existantes.

-- status perd son NOT NULL DEFAULT 'active' : create-checkout-session doit
-- pouvoir poser stripe_customer_id AVANT qu'un abonnement Stripe existe (un
-- customer "nu", cree au premier Checkout). Lui assigner 'active' par
-- defaut mentirait sur l'etat reel. NULL = "customer Stripe existe, aucun
-- abonnement pour l'instant".
alter table public.subscriptions
  alter column status drop default,
  alter column status drop not null;

-- CHECK elargi a l'enumeration reelle des statuts Stripe -- l'ancienne liste
-- (active/canceled/past_due/trialing) aurait rejete un webhook legitime sur
-- unpaid/incomplete/incomplete_expired/paused. NULL explicitement autorise
-- (etat "customer sans abonnement" ci-dessus).
alter table public.subscriptions
  drop constraint if exists subscriptions_status_check;
alter table public.subscriptions
  add constraint subscriptions_status_check check (
    status is null or status in (
      'incomplete', 'incomplete_expired', 'trialing', 'active',
      'past_due', 'canceled', 'unpaid', 'paused'
    )
  );

-- Necessaire pour distinguer "actif, se renouvelle" de "actif, se termine le
-- [current_period_end]" apres une resiliation via le Customer Portal (Stripe
-- ne supprime pas l'abonnement immediatement par defaut -- il reste actif
-- jusqu'a la fin de la periode deja payee).
alter table public.subscriptions
  add column if not exists cancel_at_period_end boolean not null default false;

-- Horodatage de derniere modification de la ligne, un point -- jamais
-- utilise pour decider si un evenement webhook est ancien ou recent (voir
-- stripe_event_created_at ci-dessous, seule colonne habilitee pour cette
-- decision). Meme convention que vinted_accounts.updated_at
-- (set_default_vinted_account RPC, 20260709170000) : pas de trigger, chaque
-- ecriture (create-checkout-session/stripe-webhook, service_role) doit poser
-- explicitement `updated_at = now()`.
alter table public.subscriptions
  add column if not exists updated_at timestamptz not null default now();

-- Horodatage Stripe (event.created, Unix seconds -> timestamptz via
-- to_timestamp() cote SQL ou new Date(event.created * 1000) cote
-- TypeScript -- jamais l'entier brut) du DERNIER evenement webhook
-- effectivement applique a cette ligne. Distinct d'updated_at (horloge
-- locale ResellOS) : c'est l'horloge Stripe qui sert de garde-fou anti-
-- desordre, seule source fiable pour comparer deux evenements entre eux.
--
-- NULL tant qu'aucun webhook n'a encore ete traite pour cet utilisateur --
-- notamment juste apres create-checkout-session, qui pose stripe_customer_id
-- (et donc `updated_at = now()`) AVANT que Stripe n'emette le premier
-- customer.subscription.created. Si stripe_event_created_at avait recu un
-- DEFAULT now() comme updated_at, ce tout premier webhook legitime aurait pu
-- se voir rejete a tort : son event.created (horloge Stripe) peut etre
-- legerement anterieur au moment ou create-checkout-session a pose la ligne
-- (horloge ResellOS), les deux horloges n'etant pas synchronisees a la
-- microseconde pres.
--
-- Regle appliquee par stripe-webhook (Lot 3) : un evenement recu est
-- applicable si `stripe_event_created_at is null or event.created >=
-- stripe_event_created_at` (comparaison de timestamptz, pas d'entiers bruts).
-- Une fois applique, stripe-webhook ecrit `stripe_event_created_at :=
-- to_timestamp(event.created)`. Un evenement plus ancien que la valeur deja
-- stockee est ignore (log, pas d'erreur) sans jamais toucher aucune colonne
-- de la ligne.
alter table public.subscriptions
  add column if not exists stripe_event_created_at timestamptz;

-- Un seul abonnement "courant" par utilisateur -- cible d'upsert du webhook
-- (Lot 3), jamais d'accumulation de lignes historiques dans ce perimetre.
-- unique(stripe_subscription_id) en defense en profondeur contre une
-- double-insertion si jamais deux evenements webhook concurrents creaient
-- chacun une ligne au lieu de faire l'upsert attendu. Les deux colonnes
-- tolerent NULL (etat "customer sans abonnement" ci-dessus ; Postgres
-- n'applique jamais l'unicite entre plusieurs NULL).
alter table public.subscriptions
  add constraint subscriptions_user_id_key unique (user_id);
alter table public.subscriptions
  add constraint subscriptions_stripe_subscription_id_key unique (stripe_subscription_id);

-- Redondant avec l'index unique cree automatiquement par la contrainte
-- unique(user_id) ci-dessus (meme colonne, memes requetes servies).
drop index if exists subscriptions_user_id_idx;
