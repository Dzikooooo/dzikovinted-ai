-- Espace Communaute, Lot 1 (fondations) : table unifiee pour
-- changelog/tutorial/guide/resource/faq (meme forme : titre, corps,
-- statut brouillon/publie, auteur, date de publication -- voir le plan
-- valide avec l'utilisateur, 2026-07-27) + fonction is_admin() partagee
-- par toutes les policies d'ecriture admin a venir sur les tables
-- Communaute (community_content aujourd'hui, roadmap_items/polls/
-- suggestions/support_tickets dans des migrations ulterieures).

-- is_admin() : lit uniquement la ligne profiles de l'appelant
-- (auth.uid()), deja autorisee par la policy existante "auth.uid() = id"
-- (20260615080503_create_dzikovinted_schema.sql:71) -- pas besoin de
-- SECURITY DEFINER ici, contrairement aux RPC de credits qui ecrivent
-- pour le compte d'un p_user_id explicite.
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

revoke execute on function public.is_admin() from anon;
grant execute on function public.is_admin() to authenticated;

create table if not exists public.community_content (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('changelog', 'tutorial', 'guide', 'resource', 'faq')),
  status text not null default 'draft' check (status in ('draft', 'published')),
  title text not null,
  slug text not null,
  excerpt text,
  body text not null default '',
  cover_image_url text,
  -- Pertinent uniquement pour type='resource' (PDF/video/mini-formation) --
  -- nullable, ignore par les autres types, meme discipline que les
  -- colonnes Vinted nullables sur listings.
  resource_kind text check (resource_kind in ('pdf', 'video', 'link')),
  resource_url text,
  -- Tri manuel + regroupement (arborescence type Notion pour
  -- tutoriels/guides, groupement par theme pour la FAQ). Ignore par
  -- 'changelog', trie par published_at. Ajoute des le depart : cout nul
  -- maintenant, ALTER TABLE couteux plus tard une fois la table peuplee.
  category text,
  sort_order integer not null default 0,
  author_id uuid not null references public.profiles(id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Tolerance de schema pour la future synchronisation Discord (voir le
  -- plan, partie 3 -- pas construite dans ce chantier) : permettra plus
  -- tard un cross-post "cette actu a ete relayee sur #annonces" sans
  -- migration supplementaire.
  discord_channel_id text,
  discord_message_id text,
  discord_synced_at timestamptz,
  constraint community_content_type_slug_unique unique (type, slug)
);

create index if not exists community_content_type_status_idx
  on public.community_content (type, status, published_at desc);
create index if not exists community_content_category_idx
  on public.community_content (type, category, sort_order);

alter table public.community_content enable row level security;

drop policy if exists "select_community_content" on public.community_content;
create policy "select_community_content" on public.community_content
  for select to authenticated
  using (status = 'published' or is_admin());

drop policy if exists "insert_admin_community_content" on public.community_content;
create policy "insert_admin_community_content" on public.community_content
  for insert to authenticated
  with check (is_admin() and author_id = auth.uid());

drop policy if exists "update_admin_community_content" on public.community_content;
create policy "update_admin_community_content" on public.community_content
  for update to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists "delete_admin_community_content" on public.community_content;
create policy "delete_admin_community_content" on public.community_content
  for delete to authenticated
  using (is_admin());
