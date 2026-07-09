-- Journal d'historique pour le moteur d'intelligence metier (Phase 2) : les
-- signaux de tendance ("perte de visibilite", "evolution dans le temps")
-- sont impossibles a calculer honnetement sans un historique reel - chaque
-- synchro ecrase aujourd'hui views/favourites/price sur `listings` sans
-- garder de trace. Cette table est un journal append-only (jamais de
-- update/delete) alimente par l'extension a chaque synchro, y compris la
-- toute premiere visite (sert de point de depart pour les comparaisons
-- futures). Tant que l'historique est insuffisant pour un article, les
-- signaux de tendance ne produisent simplement rien - pas de tendance
-- fabriquee a partir d'un seul instantane.

create table listing_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  views integer,
  favourites integer,
  price numeric,
  vinted_status text,
  captured_at timestamptz not null default now()
);

create index listing_metric_snapshots_listing_id_idx
  on listing_metric_snapshots (listing_id, captured_at desc);

alter table listing_metric_snapshots enable row level security;

create policy "select_own_listing_metric_snapshots" on listing_metric_snapshots for select
  to authenticated using (listing_id in (select id from listings where user_id = auth.uid()));

create policy "insert_own_listing_metric_snapshots" on listing_metric_snapshots for insert
  to authenticated with check (listing_id in (select id from listings where user_id = auth.uid()));
