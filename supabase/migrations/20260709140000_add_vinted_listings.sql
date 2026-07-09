-- Miroir en lecture seule des annonces reellement en ligne sur Vinted,
-- synchronise par l'extension Chrome (etape 1.3). Distinct de `listings`
-- (annonces creees dans ResellOS, avec prix d'achat/frais/statut de vente -
-- voir EXTENSION.md §5 pour pourquoi ces deux tables restent separees).
-- status fixe a 'actif' pour ce MVP : seul l'onglet "Actifs" (affiche par
-- defaut sur le profil Vinted) est lu, pas de detection reserve/vendu.

create table if not exists vinted_listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  vinted_item_id text not null,
  title text not null,
  price numeric,
  image_url text,
  vinted_url text not null,
  status text not null default 'actif',
  favourites int,
  views int,
  synced_at timestamptz not null default now(),
  unique (user_id, vinted_item_id)
);

alter table vinted_listings enable row level security;

drop policy if exists "select_own_vinted_listings" on vinted_listings;
drop policy if exists "insert_own_vinted_listings" on vinted_listings;
drop policy if exists "update_own_vinted_listings" on vinted_listings;

create policy "select_own_vinted_listings" on vinted_listings for select
  to authenticated using (auth.uid() = user_id);
create policy "insert_own_vinted_listings" on vinted_listings for insert
  to authenticated with check (auth.uid() = user_id);
create policy "update_own_vinted_listings" on vinted_listings for update
  to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
