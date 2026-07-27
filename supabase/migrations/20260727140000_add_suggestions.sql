-- Espace Communaute, Lot 5 : suggestions de la communaute. SEUL endroit de
-- tout l'espace Communaute ou "Creer" n'est PAS reserve a l'admin -- tout
-- utilisateur authentifie peut soumettre une suggestion. Seuls le statut
-- et la reponse officielle (admin_reply/admin_reply_at/status) sont
-- reserves a l'admin. NE PAS gater insert_own_suggestions par is_admin()
-- dans un lot futur -- ce serait une regression fonctionnelle, pas un
-- durcissement de securite (voir le plan, section Lot 5).
--
-- Meme mecanique anti-spam + compteur denormalise que les sondages (Lot 4,
-- 20260727130000_add_polls.sql) : un upvote par utilisateur par
-- suggestion, votes_count maintenu par trigger SECURITY DEFINER, les
-- lignes de vote elles-memes ne sont jamais lisibles publiquement.
--
-- Reutilise is_admin() defini dans 20260727100000_add_community_content.sql.

create table if not exists public.suggestions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  status text not null default 'open' check (status in ('open', 'planned', 'in_progress', 'done', 'declined')),
  author_id uuid not null references public.profiles(id),
  admin_reply text,
  admin_reply_at timestamptz,
  votes_count integer not null default 0,
  min_plan text check (min_plan in ('free', 'pro', 'team')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.suggestion_votes (
  id uuid primary key default gen_random_uuid(),
  suggestion_id uuid not null references public.suggestions(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint suggestion_votes_suggestion_user_unique unique (suggestion_id, user_id)
);

create index if not exists suggestions_votes_count_idx on public.suggestions (votes_count desc);
create index if not exists suggestion_votes_suggestion_id_idx on public.suggestion_votes (suggestion_id);
create index if not exists suggestion_votes_user_id_idx on public.suggestion_votes (user_id);

alter table public.suggestions enable row level security;
alter table public.suggestion_votes enable row level security;

-- Lecture publique : toute suggestion (quel que soit son statut) reste
-- visible, meme discipline que les sondages clos (le resultat/la reponse
-- officielle reste consultable).
drop policy if exists "select_suggestions" on public.suggestions;
create policy "select_suggestions" on public.suggestions
  for select to authenticated
  using (true);

-- Volontairement PAS is_admin() ici -- voir le commentaire en tete de
-- fichier. Seul auth.uid() = author_id est verifie.
drop policy if exists "insert_own_suggestions" on public.suggestions;
create policy "insert_own_suggestions" on public.suggestions
  for insert to authenticated
  with check (author_id = auth.uid());

-- Update reserve a l'admin (statut + reponse officielle) -- un auteur ne
-- peut pas modifier sa suggestion apres coup dans cette premiere version
-- (pas demande par le plan, a ajouter dans un lot ulterieur si le besoin
-- reel se confirme).
drop policy if exists "update_admin_suggestions" on public.suggestions;
create policy "update_admin_suggestions" on public.suggestions
  for update to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists "delete_admin_suggestions" on public.suggestions;
create policy "delete_admin_suggestions" on public.suggestions
  for delete to authenticated
  using (is_admin());

-- suggestion_votes : jamais lisible publiquement, meme principe que
-- poll_votes -- seul son propre vote, ou l'admin.
drop policy if exists "select_own_suggestion_votes" on public.suggestion_votes;
create policy "select_own_suggestion_votes" on public.suggestion_votes
  for select to authenticated
  using (user_id = auth.uid() or is_admin());

drop policy if exists "insert_own_suggestion_votes" on public.suggestion_votes;
create policy "insert_own_suggestion_votes" on public.suggestion_votes
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "delete_own_suggestion_votes" on public.suggestion_votes;
create policy "delete_own_suggestion_votes" on public.suggestion_votes
  for delete to authenticated
  using (user_id = auth.uid());

-- Trigger de comptage, meme forme que bump_poll_option_votes_count
-- (SECURITY DEFINER : l'utilisateur qui vote n'a, lui, aucune policy
-- UPDATE directe sur suggestions).
create or replace function public.bump_suggestion_votes_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update suggestions set votes_count = votes_count + 1 where id = new.suggestion_id;
  elsif tg_op = 'DELETE' then
    update suggestions set votes_count = votes_count - 1 where id = old.suggestion_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_bump_suggestion_votes_count on public.suggestion_votes;
create trigger trg_bump_suggestion_votes_count
  after insert or delete on public.suggestion_votes
  for each row
  execute function public.bump_suggestion_votes_count();
