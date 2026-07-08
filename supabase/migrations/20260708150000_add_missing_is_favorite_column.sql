-- La migration initiale (20260615080503) declarait is_favorite mais la
-- colonne n'a jamais existe reellement en base -- derive schema/migrations.
-- Casse silencieusement le compteur de favoris (DashboardHome, StatsPage) :
-- le client Supabase ne leve pas d'exception sur un 400, la valeur retombe
-- juste a 0 sans jamais d'erreur visible.
alter table listings
  add column if not exists is_favorite boolean default false;
