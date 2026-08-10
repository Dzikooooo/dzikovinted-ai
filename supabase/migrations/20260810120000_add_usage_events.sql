-- Instrumentation minimale cout/usage (Lot 3, Market Engine V2, 2026-08-10).
-- NON APPLIQUEE en production dans cette passe -- creee pour revue avant
-- autorisation (voir rapport). Objectif explicite : savoir combien de
-- generations IA/user, combien atteignent le Market Engine (vs fallback
-- IA pure), avec quelle qualite de comparables -- sans construire un
-- systeme FinOps generique. Un evenement = une generation reussie dans
-- analyze-clothing, jamais plus granulaire que necessaire pour repondre
-- aux questions posees (voir _shared/marketEngine.ts pour les champs
-- exacts ecrits dans metadata).
--
-- event_type reste texte libre (pas de check enum) : un seul type est
-- ecrit aujourd'hui ('generation_completed'), une future evolution
-- (ex. 'scan_completed') n'exigera pas de migration pour un simple ajout
-- de valeur -- coherent avec l'exemple conceptuel demande ("usage_events :
-- user_id, event_type, metadata, created_at"), pas une usine a gaz.

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Index de lecture prevus (agregations "N generations / user",
-- "taux de succes Market Engine par jour") -- pas d'index sur metadata
-- (jsonb) tant qu'aucune requete reelle ne le justifie.
create index if not exists usage_events_user_created_idx on public.usage_events (user_id, created_at desc);
create index if not exists usage_events_type_created_idx on public.usage_events (event_type, created_at desc);

alter table public.usage_events enable row level security;

-- Deny-by-default identique a beta_commercial_offers (20260810110000) :
-- aucune policy pour authenticated/anon -- ni lecture ni ecriture directe
-- possible, meme si les grants de table par defaut de Supabase existent
-- (RLS reste la seule barriere reelle, deja verifiee dans ce projet). Seule
-- exception : un admin peut lire l'ensemble (meme pattern que "admins can
-- view all profiles"/"admins can view all commercial offers"), pour une
-- future page d'observabilite Admin -- non construite dans cette passe.
drop policy if exists "admins can view all usage events" on public.usage_events;
create policy "admins can view all usage events"
  on public.usage_events for select
  to authenticated
  using (public.is_admin());

-- Ecriture reservee a service_role (analyze-clothing utilise deja un
-- client service_role pour reserve_credit/consume_credit_reservation --
-- meme client reutilise ici, aucun nouveau chemin de confiance cree).
revoke all on public.usage_events from anon, authenticated;
grant select on public.usage_events to authenticated;
grant insert on public.usage_events to service_role;
