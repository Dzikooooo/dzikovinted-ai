-- Espace Communaute, Lot 4 : sondages. Crees par l'admin, un vote par
-- utilisateur par sondage (contrainte unique en base, pas seulement cote
-- client). Compteur poll_options.votes_count denormalise, maintenu par
-- trigger -- evite d'agreger a la volee sur des lignes de vote qui ne
-- sont, elles, jamais lisibles publiquement (voir policy select_poll_votes
-- ci-dessous : seul l'auteur d'un vote et l'admin voient qui a vote quoi).
--
-- Reutilise is_admin() defini dans 20260727100000_add_community_content.sql.

create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  description text,
  status text not null default 'open' check (status in ('open', 'closed')),
  author_id uuid not null references public.profiles(id),
  min_plan text check (min_plan in ('free', 'pro', 'team')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  label text not null,
  sort_order integer not null default 0,
  votes_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  option_id uuid not null references public.poll_options(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint poll_votes_poll_user_unique unique (poll_id, user_id)
);

create index if not exists poll_options_poll_id_idx on public.poll_options (poll_id, sort_order);
create index if not exists poll_votes_poll_id_idx on public.poll_votes (poll_id);
create index if not exists poll_votes_user_id_idx on public.poll_votes (user_id);

alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;

-- polls / poll_options : lecture publique (y compris sondages fermes, pour
-- que le resultat final reste consultable), ecriture admin uniquement.
drop policy if exists "select_polls" on public.polls;
create policy "select_polls" on public.polls
  for select to authenticated
  using (true);

drop policy if exists "insert_admin_polls" on public.polls;
create policy "insert_admin_polls" on public.polls
  for insert to authenticated
  with check (is_admin() and author_id = auth.uid());

drop policy if exists "update_admin_polls" on public.polls;
create policy "update_admin_polls" on public.polls
  for update to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists "delete_admin_polls" on public.polls;
create policy "delete_admin_polls" on public.polls
  for delete to authenticated
  using (is_admin());

drop policy if exists "select_poll_options" on public.poll_options;
create policy "select_poll_options" on public.poll_options
  for select to authenticated
  using (true);

-- Pas de policy insert/update/delete pour authenticated sur poll_options :
-- la creation des options se fait via l'admin (meme mecanisme que polls),
-- et le seul UPDATE necessaire pour un non-admin (incrementer votes_count)
-- passe exclusivement par le trigger SECURITY DEFINER ci-dessous, jamais
-- par un UPDATE direct du client -- meme discipline que listing_skus (voir
-- 20260726200000_add_sku_registry_and_migrate.sql).
drop policy if exists "insert_admin_poll_options" on public.poll_options;
create policy "insert_admin_poll_options" on public.poll_options
  for insert to authenticated
  with check (is_admin());

drop policy if exists "update_admin_poll_options" on public.poll_options;
create policy "update_admin_poll_options" on public.poll_options
  for update to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists "delete_admin_poll_options" on public.poll_options;
create policy "delete_admin_poll_options" on public.poll_options
  for delete to authenticated
  using (is_admin());

-- poll_votes : jamais lisible publiquement (seul son propre vote, ou
-- l'admin) -- les resultats agreges passent uniquement par
-- poll_options.votes_count.
drop policy if exists "select_own_poll_votes" on public.poll_votes;
create policy "select_own_poll_votes" on public.poll_votes
  for select to authenticated
  using (user_id = auth.uid() or is_admin());

-- Un vote n'est accepte que si le sondage cible est encore ouvert -- garde
-- en base, pas seulement cote client (meme principe que les contraintes
-- unique deja en place sur watchlist/opportunity_favourites).
drop policy if exists "insert_own_poll_votes" on public.poll_votes;
create policy "insert_own_poll_votes" on public.poll_votes
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.polls where id = poll_id and status = 'open')
  );

-- Autorise a retirer/changer son propre vote tant que le sondage reste
-- ouvert (flux "changer mon vote" = delete puis insert cote client).
drop policy if exists "delete_own_poll_votes" on public.poll_votes;
create policy "delete_own_poll_votes" on public.poll_votes
  for delete to authenticated
  using (
    user_id = auth.uid()
    and exists (select 1 from public.polls where id = poll_id and status = 'open')
  );

-- Trigger de comptage : SECURITY DEFINER pour pouvoir ecrire
-- poll_options.votes_count meme si l'utilisateur qui vote n'a, lui, aucune
-- policy UPDATE directe sur poll_options (voir plus haut).
create or replace function public.bump_poll_option_votes_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update poll_options set votes_count = votes_count + 1 where id = new.option_id;
  elsif tg_op = 'DELETE' then
    update poll_options set votes_count = votes_count - 1 where id = old.option_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_bump_poll_option_votes_count on public.poll_votes;
create trigger trg_bump_poll_option_votes_count
  after insert or delete on public.poll_votes
  for each row
  execute function public.bump_poll_option_votes_count();
