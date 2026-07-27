-- Espace Communaute, Lot 3 : roadmap publique. Forme volontairement
-- differente de community_content -- cycle de vie planned/in_progress/
-- shipped, pas un brouillon/publie (voir le plan : "Correspond exactement
-- a planned/in_progress/shipped"). Un item cree par l'admin est visible
-- immediatement, il n'existe pas d'etat intermediaire cache.
--
-- Reutilise is_admin() defini dans 20260727100000_add_community_content.sql.

create table if not exists public.roadmap_items (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'shipped')),
  title text not null,
  description text not null default '',
  -- Tri manuel a l'interieur d'une colonne (Now/Next/Later cote UI).
  sort_order integer not null default 0,
  author_id uuid not null references public.profiles(id),
  -- Meme convention de tolerance de schema que community_content.min_plan
  -- (voir 20260727110000) -- toujours null tant qu'aucun gating reel n'existe.
  min_plan text check (min_plan in ('free', 'pro', 'team')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists roadmap_items_status_idx
  on public.roadmap_items (status, sort_order);

alter table public.roadmap_items enable row level security;

-- Roadmap publique : tout utilisateur authentifie la voit, quel que soit
-- son statut -- pas de notion de brouillon ici (contrairement a
-- community_content).
drop policy if exists "select_roadmap_items" on public.roadmap_items;
create policy "select_roadmap_items" on public.roadmap_items
  for select to authenticated
  using (true);

drop policy if exists "insert_admin_roadmap_items" on public.roadmap_items;
create policy "insert_admin_roadmap_items" on public.roadmap_items
  for insert to authenticated
  with check (is_admin() and author_id = auth.uid());

drop policy if exists "update_admin_roadmap_items" on public.roadmap_items;
create policy "update_admin_roadmap_items" on public.roadmap_items
  for update to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists "delete_admin_roadmap_items" on public.roadmap_items;
create policy "delete_admin_roadmap_items" on public.roadmap_items
  for delete to authenticated
  using (is_admin());
