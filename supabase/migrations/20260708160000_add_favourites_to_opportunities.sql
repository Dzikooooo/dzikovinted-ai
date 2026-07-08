-- favourites (nombre de coeurs Vinted) est deja scrape par vinted-scan.ts
-- (utilise pour filtrer les items peu populaires) mais jamais persiste.
-- L'exposer permet d'afficher un signal de popularite reel sur les cartes
-- d'opportunites, sans inventer de metrique.
alter table market_opportunities
  add column if not exists favourites integer default 0;
