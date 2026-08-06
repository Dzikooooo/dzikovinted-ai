-- Persistance des recommandations du Decision Engine (Lot "Suivi des
-- annonces", voir LOT_SUIVI_ANNONCES_SPEC.md). Le Lot 1 du Decision Engine
-- (src/lib/insights/recommendations.ts) recalcule tout en memoire a chaque
-- chargement -- rien n'est jamais ecrit, impossible de savoir "qu'est-ce qui
-- a ete recommande la semaine derniere" ou "une recommandation a-t-elle ete
-- suivie". Cette table comble cette seule lacune reelle, sans dupliquer
-- aucune autre donnee deja disponible (listing_metric_snapshots, action_log).
--
-- Un "episode" = une periode continue pendant laquelle la MEME
-- recommandation (meme `kind`) est active pour une annonce. Au plus UNE
-- ligne ouverte (resolved_at is null) par annonce a tout instant, garanti
-- par l'index unique partiel ci-dessous -- c'est le mecanisme central
-- d'idempotence : un refresh qui retrouve la meme recommandation ne cree
-- jamais de nouvelle ligne, il met seulement a jour last_confirmed_at.
--
-- Seules les recommandations status='action' du Lot 1 sont journalisees ici
-- (jamais attendre/donnees_insuffisantes/recommandation_differee, qui ne
-- sont pas des recommandations emises mais des absences ou des reports deja
-- expliques par le moteur lui-meme).

create table listing_recommendation_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  listing_id uuid not null references listings(id) on delete cascade,

  kind text not null,                 -- RecommendationKind (verifier_annonce/considerer_republication/baisser_prix/revoir_annonce)
  confidence text not null,           -- 'haute' | 'standard'
  reason text not null,               -- texte genere, FIGE au moment de l'ecriture -- jamais recalcule retroactivement
  cta_type text not null,             -- 'open_vinted' | 'edit_listing' (miroir de RecommendationCta.type)

  shown_at timestamptz not null default now(),          -- premiere apparition de cet episode
  last_confirmed_at timestamptz not null default now(), -- derniere fois que ce meme episode etait encore valide (heartbeat)

  -- Garde-fous d'expiration (voir LOT_SUIVI_ANNONCES_SPEC.md addendum) :
  -- une recommandation ne doit JAMAIS expirer sur une seule disparition de
  -- la regle, ni quand la synchro est perimee, ni quand l'etat devient
  -- donnees_insuffisantes -- uniquement apres plusieurs evaluations FRAICHES
  -- consecutives sans rematch ET une duree minimale ecoulee. Ces deux
  -- colonnes portent ce compteur ; les seuils eux-memes sont des constantes
  -- cote application (src/lib/insights/constants.ts), jamais codes en dur ici.
  consecutive_misses integer not null default 0,
  first_miss_at timestamptz,          -- date du premier "miss" frais consecutif -- null tant qu'aucun miss n'est en cours

  resolved_at timestamptz,            -- non-null ssi l'episode est clos
  resolution text                     -- 'suivie' | 'ignoree' | 'expiree' | 'remplacee' (non-null ssi resolved_at non-null)
    check (resolution in ('suivie', 'ignoree', 'expiree', 'remplacee')),
  resolution_action_id uuid references action_log(id) on delete set null, -- renseigne uniquement si resolution='suivie'

  check ((resolved_at is null) = (resolution is null)),
  check (kind in ('verifier_annonce', 'considerer_republication', 'baisser_prix', 'revoir_annonce')),
  check (confidence in ('haute', 'standard')),
  check (cta_type in ('open_vinted', 'edit_listing'))
);

-- Requete timeline (toutes les lignes d'une annonce, triees).
create index listing_recommendation_log_listing_id_idx
  on listing_recommendation_log (listing_id, shown_at desc);

-- Coeur de l'idempotence (voir commentaire d'en-tete) : au plus une ligne
-- ouverte par annonce, meme sous ecriture concurrente (deux onglets) -- une
-- seconde tentative d'INSERT viole cet index (23505), a traiter cote
-- application comme "quelqu'un d'autre a deja ouvert cet episode" plutot
-- que comme une erreur (voir recommendationLog.ts).
create unique index listing_recommendation_log_open_unique
  on listing_recommendation_log (listing_id)
  where resolved_at is null;

alter table listing_recommendation_log enable row level security;

-- Meme schema RLS que action_log/listing_metric_snapshots : ecrit
-- exclusivement cote app web (useInsights.ts), jamais par l'extension.
create policy "select_own_listing_recommendation_log" on listing_recommendation_log for select
  to authenticated using (auth.uid() = user_id);

create policy "insert_own_listing_recommendation_log" on listing_recommendation_log for insert
  to authenticated with check (
    auth.uid() = user_id
    and listing_id in (select id from listings where user_id = auth.uid())
  );

-- update necessaire pour : heartbeat (last_confirmed_at/consecutive_misses),
-- resolution (resolved_at/resolution/resolution_action_id). Meme perimetre
-- que insert -- jamais de modification d'une ligne appartenant a un autre
-- utilisateur, jamais de rattachement a une annonce qui ne lui appartient pas.
create policy "update_own_listing_recommendation_log" on listing_recommendation_log for update
  to authenticated using (auth.uid() = user_id) with check (
    auth.uid() = user_id
    and listing_id in (select id from listings where user_id = auth.uid())
  );
