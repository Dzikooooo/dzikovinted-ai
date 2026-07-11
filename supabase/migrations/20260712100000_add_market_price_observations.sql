-- Journal d'historique des prix/observations de marche (moteur d'opportunites,
-- phase 2) : meme convention append-only que listing_metric_snapshots
-- (20260709200000) - jamais d'update/delete, une ligne par item pertinent
-- vu a chaque scan, meme s'il ne clarifie pas le seuil d'opportunite cette
-- fois-ci. C'est ce qui permet de calculer un historique de prix reel
-- (moyenne/mediane dans le temps), une frequence de disparition (proxy de
-- duree de revente) et une saisonnalite - aucun de ces signaux n'existait
-- avant cette table, market_opportunities etant integralement recreee a
-- chaque scan (voir scripts/vinted-scan.ts).

create table market_price_observations (
  id uuid primary key default gen_random_uuid(),
  watchlist_id uuid references watchlist(id) on delete cascade,
  vinted_url text not null,
  brand text,
  category text,
  price numeric not null,
  favourites integer default 0,
  scanned_at timestamptz not null default now()
);

create index market_price_observations_url_idx
  on market_price_observations (vinted_url, scanned_at desc);
create index market_price_observations_watchlist_idx
  on market_price_observations (watchlist_id, scanned_at desc);
create index market_price_observations_category_idx
  on market_price_observations (category, scanned_at desc);

alter table market_price_observations enable row level security;

-- Meme convention que watchlist/market_opportunities : lecture authenticated,
-- ecriture uniquement via service_role (scripts/vinted-scan.ts), qui bypass
-- RLS - aucune policy insert necessaire pour lui, et volontairement aucune
-- n'est ajoutee pour authenticated/anon (donnee de marche globale, pas
-- appartenant a un utilisateur, mais on ne veut pas qu'un client authentifie
-- puisse y ecrire directement).
create policy "authenticated can read market price observations"
  on market_price_observations for select to authenticated using (true);
