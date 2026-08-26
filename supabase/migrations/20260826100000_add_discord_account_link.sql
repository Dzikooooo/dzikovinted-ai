-- Liaison du compte Discord d'un utilisateur (onglet Communaute > Discord).
-- Appliquee le 2026-08-26 apres revue. Une correction a ete faite juste avant
-- application : extraction du pseudo Discord (voir le commentaire dans
-- sync_discord_identity()).
--
-- ============================================================================
-- POURQUOI CES COLONNES NE SONT PAS EDITABLES PAR LE CLIENT
-- ============================================================================
-- `discord_user_id` n'est pas une preference : c'est l'identifiant sur lequel
-- reposera l'octroi de roles/salons prives sur le serveur Discord. Si
-- `authenticated` pouvait l'ecrire librement, n'importe quel compte pourrait
-- revendiquer le Discord d'un autre et recuperer ses acces. C'est une colonne
-- de MEME nature que plan/credits (voir 20260711090000_lock_billing_columns) :
-- aucun GRANT UPDATE n'est donc accorde dessus.
--
-- La valeur ne vient jamais d'une saisie client : sync_discord_identity() la
-- lit dans auth.identities, c'est-a-dire l'identite reellement verifiee par le
-- flux OAuth2 Discord de Supabase Auth. Le client n'a aucun parametre a
-- fournir -- il ne peut donc rien falsifier.

alter table public.profiles add column if not exists discord_user_id text;
alter table public.profiles add column if not exists discord_username text;
alter table public.profiles add column if not exists discord_synced_at timestamptz;

-- Un compte Discord ne peut etre lie qu'a UN seul compte ResellOS : sans cet
-- index, deux utilisateurs pourraient pointer le meme Discord et se disputer
-- le meme role. Index partiel (les NULL, majoritaires, ne sont pas indexes).
create unique index if not exists profiles_discord_user_id_key
  on public.profiles (discord_user_id)
  where discord_user_id is not null;

-- Recherche par identifiant Discord (futur worker de synchronisation des
-- roles, qui parcourt les membres du serveur pour reconcilier les plans).
create index if not exists profiles_discord_synced_at_idx
  on public.profiles (discord_synced_at)
  where discord_user_id is not null;

-- ============================================================================
-- sync_discord_identity() -- copie l'identite OAuth verifiee vers le profil
-- ============================================================================
-- SECURITY DEFINER car auth.identities n'est pas lisible par `authenticated`.
-- AUCUN parametre : tout est derive de auth.uid() et de l'identite Discord
-- reellement rattachee a cet utilisateur. Appeler cette fonction sans avoir
-- termine le flux OAuth leve une erreur explicite plutot que d'ecrire un
-- lien vide.
create or replace function public.sync_discord_identity()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_discord_id text;
  v_discord_name text;
  v_profile public.profiles;
begin
  if v_uid is null then
    raise exception 'Authentification requise';
  end if;

  -- CORRIGE avant application (2026-08-26) : la premiere branche etait
  -- `identity_data ->> 'custom_claims'`, qui rend l'OBJET JSON serialise en
  -- texte, pas un pseudo. Comme Discord fournit presque toujours cette cle,
  -- discord_username aurait stocke {"global_name":"..."} -- et l'interface
  -- l'affiche tel quel, precede d'un @ (DiscordTab.tsx). Il faut descendre
  -- d'un niveau avec -> puis ->>.
  select i.provider_id,
         coalesce(
           i.identity_data -> 'custom_claims' ->> 'global_name',
           i.identity_data ->> 'user_name',
           i.identity_data ->> 'preferred_username',
           i.identity_data ->> 'full_name',
           i.identity_data ->> 'name'
         )
    into v_discord_id, v_discord_name
  from auth.identities i
  where i.user_id = v_uid
    and i.provider = 'discord'
  limit 1;

  if v_discord_id is null then
    raise exception 'Aucun compte Discord relie a cet utilisateur';
  end if;

  -- Conflit d'unicite traduit en message comprehensible : ce cas arrive
  -- reellement si un membre tente de relier un Discord deja utilise.
  if exists (
    select 1 from public.profiles p
    where p.discord_user_id = v_discord_id and p.id <> v_uid
  ) then
    raise exception 'Ce compte Discord est deja relie a un autre compte ResellOS';
  end if;

  update public.profiles p
     set discord_user_id = v_discord_id,
         discord_username = v_discord_name,
         discord_synced_at = now()
   where p.id = v_uid
  returning p.* into v_profile;

  return v_profile;
end;
$$;

-- ============================================================================
-- unlink_discord_account() -- dissociation
-- ============================================================================
-- Passe aussi par une RPC plutot qu'un GRANT UPDATE : accorder l'ecriture sur
-- discord_user_id pour permettre la mise a NULL l'accorderait aussi pour y
-- ecrire n'importe quelle valeur. Une fonction qui ne sait QUE effacer ne
-- presente pas ce risque.
create or replace function public.unlink_discord_account()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
begin
  if v_uid is null then
    raise exception 'Authentification requise';
  end if;

  update public.profiles p
     set discord_user_id = null,
         discord_username = null,
         discord_synced_at = null
   where p.id = v_uid
  returning p.* into v_profile;

  return v_profile;
end;
$$;

revoke all on function public.sync_discord_identity() from public;
revoke all on function public.unlink_discord_account() from public;
grant execute on function public.sync_discord_identity() to authenticated;
grant execute on function public.unlink_discord_account() to authenticated;
