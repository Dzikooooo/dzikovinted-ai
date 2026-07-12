-- Opportunity Intelligence - performance a l'echelle (2026-07-12).
-- scripts/vinted-scan.ts filtre deja market_price_observations sur une
-- fenetre glissante de 60 jours (.gte("scanned_at", ...),
-- OBSERVATION_LOOKBACK_DAYS dans scripts/opportunity-engine/constants.ts),
-- mais aucun des 3 index existants (vinted_url, watchlist_id, category -
-- tous avec scanned_at en second, jamais en tete) ne permet a Postgres de
-- faire un balayage d'index sur ce filtre. Sans cet index, la requete fait
-- un balayage sequentiel complet de la table, un cout qui grandit avec le
-- volume TOTAL de la table (pas seulement la fenetre de 60 jours) - le
-- risque reel a l'echelle de plusieurs dizaines de milliers d'observations.
create index if not exists market_price_observations_scanned_at_idx
  on market_price_observations (scanned_at desc);
