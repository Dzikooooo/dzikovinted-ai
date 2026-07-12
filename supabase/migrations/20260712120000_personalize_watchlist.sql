-- Watchlist personnelle par utilisateur (2026-07-12, phase produit).
-- Avant cette migration, `watchlist` etait une liste GLOBALE unique (aucune
-- colonne user_id, ecriture reservee au service_role, contrainte
-- unique(brand, model)) - un seul jeu de recherches pour toute la
-- plateforme. Chaque revendeur peut desormais ajouter/editer/desactiver ses
-- propres recherches.
--
-- user_id est NULLABLE plutot qu'obligatoire : les 7 recherches de depart
-- (seed de 20260707130000_add_watchlist_and_opportunities.sql) ont deja
-- fait leurs preuves en production (ex. la doudoune North Face Nuptse
-- trouvee lors d'un vrai scan). Elles restent user_id = null = "recherches
-- plateforme" : scannees pour tout le monde, visibles en lecture seule,
-- mais aucun utilisateur authentifie ne peut les modifier/desactiver
-- (les policies update/delete exigent auth.uid() = user_id, jamais vrai
-- pour null). Un utilisateur ne peut creer que ses propres lignes
-- (with check (auth.uid() = user_id)).
--
-- Aucune migration necessaire sur market_price_observations.watchlist_id :
-- deja nullable, jamais relu nulle part dans le code (confirme par
-- recherche exhaustive) - un simple champ de tracabilite.

alter table watchlist add column if not exists user_id uuid references auth.users(id) on delete cascade;

do $$
begin
  alter table watchlist drop constraint watchlist_brand_model_key;
exception when undefined_object then
  null;
end $$;

do $$
begin
  alter table watchlist add constraint watchlist_user_brand_model_key unique (user_id, brand, model);
exception when duplicate_table or duplicate_object then
  null;
end $$;

drop policy if exists "authenticated can read watchlist" on watchlist;
drop policy if exists "read own or platform watchlist" on watchlist;
drop policy if exists "insert own watchlist" on watchlist;
drop policy if exists "update own watchlist" on watchlist;
drop policy if exists "delete own watchlist" on watchlist;

create policy "read own or platform watchlist" on watchlist
  for select to authenticated using (auth.uid() = user_id or user_id is null);
create policy "insert own watchlist" on watchlist
  for insert to authenticated with check (auth.uid() = user_id);
create policy "update own watchlist" on watchlist
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own watchlist" on watchlist
  for delete to authenticated using (auth.uid() = user_id);
