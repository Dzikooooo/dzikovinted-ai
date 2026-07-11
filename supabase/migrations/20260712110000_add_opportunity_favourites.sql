-- Favoris utilisateur sur les opportunites de marche. market_opportunities
-- est integralement supprimee et reecrite a chaque scan (~4h, voir
-- ARCHITECTURE.md §4.8) - une colonne "favori" dessus serait effacee a
-- chaque cycle. Table dediee, cle sur vinted_url (pas market_opportunities.id,
-- qui change a chaque scan) pour que le favori survive a la disparition
-- puis reapparition de l'annonce dans un scan ulterieur. Meme convention
-- user_id/RLS que expenses/listings (auth.uid() = user_id).

create table opportunity_favourites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  vinted_url text not null,
  created_at timestamptz not null default now(),
  unique (user_id, vinted_url)
);

alter table opportunity_favourites enable row level security;

create policy "users can read own favourites" on opportunity_favourites
  for select to authenticated using (auth.uid() = user_id);

create policy "users can insert own favourites" on opportunity_favourites
  for insert to authenticated with check (auth.uid() = user_id);

create policy "users can delete own favourites" on opportunity_favourites
  for delete to authenticated using (auth.uid() = user_id);
