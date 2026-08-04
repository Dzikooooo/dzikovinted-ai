-- Panel admin (gestion des utilisateurs + notifications), demande produit
-- 2026-08-04. Trois briques :
-- 1. profiles.banned + policy de lecture admin (aujourd'hui un admin ne
--    peut lire QUE sa propre ligne profiles, comme n'importe quel
--    utilisateur -- il lui faut voir tout le monde pour la liste).
-- 2. Deux RPC SECURITY DEFINER admin-only (meme discipline que
--    decrement_credit : verification explicite dans le corps de la
--    fonction, jamais seulement cote client) pour bloquer un compte et
--    repasser son plan a Free -- profiles.plan/role restent verrouilles en
--    ecriture directe pour authenticated (P0.1, 2026-07-11).
-- 3. notifications + notification_reads : recap "Dziko IA" a l'ouverture
--    (ventes reelles + nouveau contenu Communaute publie par l'admin) et
--    diffusion admin ciblee/globale.

alter table public.profiles add column if not exists banned boolean not null default false;

drop policy if exists "admins can view all profiles" on public.profiles;
create policy "admins can view all profiles"
  on public.profiles for select
  to authenticated
  using (public.is_admin());

create or replace function public.admin_set_user_banned(p_user_id uuid, p_banned boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'cannot ban yourself';
  end if;
  update profiles set banned = p_banned where id = p_user_id;
end;
$$;

revoke execute on function public.admin_set_user_banned(uuid, boolean) from anon;
revoke execute on function public.admin_set_user_banned(uuid, boolean) from public;
grant execute on function public.admin_set_user_banned(uuid, boolean) to authenticated;

create or replace function public.admin_set_user_plan(p_user_id uuid, p_plan text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  if p_plan not in ('free', 'pro', 'team') then
    raise exception 'invalid plan';
  end if;
  update profiles set plan = p_plan where id = p_user_id;
end;
$$;

revoke execute on function public.admin_set_user_plan(uuid, text) from anon;
revoke execute on function public.admin_set_user_plan(uuid, text) from public;
grant execute on function public.admin_set_user_plan(uuid, text) to authenticated;

-- notifications.user_id NULL = diffusion a tout le monde (nouveau contenu
-- Communaute publie par l'admin, ou diffusion admin explicite "tout le
-- monde"). Rempli = notification personnelle (vente reelle du proprietaire,
-- ou diffusion admin ciblee sur un compte precis).
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  type text not null check (type in ('sale', 'community', 'admin_broadcast')),
  title text not null,
  body text,
  -- Valeur DashboardPage (ex. 'watchlist', 'community') utilisee cote
  -- client pour le bouton "Voir" -- simple indication d'affichage, jamais
  -- interpretee cote serveur.
  target_page text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

drop policy if exists "users can view their own or broadcast notifications" on public.notifications;
create policy "users can view their own or broadcast notifications"
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid() or user_id is null);

-- Une notification de vente ne peut etre creee que par son propre
-- proprietaire, pour lui-meme -- jamais pour le compte de quelqu'un
-- d'autre (meme discipline que insert_own_profile).
drop policy if exists "users can create their own sale notifications" on public.notifications;
create policy "users can create their own sale notifications"
  on public.notifications for insert
  to authenticated
  with check (type = 'sale' and user_id = auth.uid());

-- Nouveau contenu Communaute publie + diffusion admin explicite (ciblee ou
-- globale) : reserve aux admins.
drop policy if exists "admins can create community and broadcast notifications" on public.notifications;
create policy "admins can create community and broadcast notifications"
  on public.notifications for insert
  to authenticated
  with check (type in ('community', 'admin_broadcast') and public.is_admin());

create table if not exists public.notification_reads (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

alter table public.notification_reads enable row level security;

drop policy if exists "users manage their own read markers" on public.notification_reads;
create policy "users manage their own read markers"
  on public.notification_reads for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
