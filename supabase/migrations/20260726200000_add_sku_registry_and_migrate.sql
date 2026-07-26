-- Registre central des SKU (2026-07-26, decision explicite de l'utilisateur
-- suite a un audit complet -- voir la conversation) : remplace
-- allocate_next_sku()/listings_user_sku_unique (20260713/20260714) comme
-- SOURCE DE VERITE UNIQUE. listings.sku reste en place comme colonne
-- denormalisee pratique (aucune reecriture des pages existantes --
-- StockPage.tsx, EditListingModal.tsx, etc. continuent de lire
-- listings.sku directement), mais n'est plus jamais ecrite directement par
-- l'application : toute allocation/liberation passe desormais par ce
-- registre.
--
-- Principes actes (2026-07-26) :
-- - un SKU n'est JAMAIS deduit du titre -- le titre n'est jamais une source
--   de verite, seulement une vue derivee au moment du formatage Vinted ;
-- - un SKU valide n'est JAMAIS renumerote automatiquement ;
-- - liberation UNIQUEMENT sur vente definitive (status='vendu', c-a-d
--   vinted_status='sold_completed' -- jamais 'reserved'/'sold_pending', deja
--   verifie dans deriveResellOsStatus, extension/src/background/sync.ts) ou
--   suppression definitive (vinted_status='deleted') -- jamais un etat
--   transitoire ;
-- - un doublon est toujours signale, jamais corrige silencieusement ;
-- - une annonce vendue/supprimee sans sku ne recoit jamais de sku
--   retroactif -- le SKU est une donnee operationnelle des articles actifs
--   uniquement.
--
-- Schema + migration de donnees dans UN SEUL fichier (pas de split en deux
-- migrations) : evite une fenetre ou le nouveau trigger d'allocation
-- tournerait deja contre un registre encore vide (collision possible avec
-- des listings.sku pre-existants pas encore migres dans le registre).

-- ============================================================
-- 1. Schema
-- ============================================================

create table if not exists public.listing_skus (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sku integer not null check (sku > 0),
  listing_id uuid not null references public.listings(id) on delete cascade,
  status text not null check (status in ('active', 'released')) default 'active',
  allocated_at timestamptz not null default now(),
  released_at timestamptz
);

-- Unicite du SKU parmi les entrees actives d'un meme utilisateur -- garde-fou
-- physique, independant de tout chemin de code applicatif.
create unique index if not exists listing_skus_user_sku_active_unique
  on public.listing_skus (user_id, sku)
  where status = 'active';

-- Un meme listing ne peut jamais avoir deux entrees actives simultanement
-- (empeche une double allocation concurrente pour le meme article).
create unique index if not exists listing_skus_listing_id_active_unique
  on public.listing_skus (listing_id)
  where status = 'active';

create index if not exists listing_skus_listing_id_idx on public.listing_skus (listing_id);
create index if not exists listing_skus_user_id_idx on public.listing_skus (user_id);

alter table public.listing_skus enable row level security;

-- drop-if-exists : CREATE POLICY n'a pas de clause IF NOT EXISTS en
-- Postgres -- meme garde que necessaire pour rendre cette migration
-- idempotente (demande explicite 2026-07-26).
drop policy if exists "Users can view their own sku registry" on public.listing_skus;
create policy "Users can view their own sku registry"
  on public.listing_skus for select
  using (auth.uid() = user_id);

-- Aucune policy insert/update/delete pour authenticated : toute ecriture
-- passe exclusivement par allocate_sku/release_sku/repair_sku_inconsistencies
-- (SECURITY DEFINER) -- jamais un insert/update direct du client.

-- ============================================================
-- 2. Fonctions publiques
-- ============================================================

-- allocate_sku : allocation atomique, idempotente (si ce listing a deja une
-- entree active, la retourne telle quelle plutot que d'en creer une seconde
-- -- necessaire pour qu'un re-sync/retry ne puisse jamais doubler
-- l'allocation d'un meme article), plus petit entier positif libre parmi
-- les actives de cet utilisateur. Verrou avise par utilisateur (leve
-- automatiquement en fin de transaction) pour qu'aucune paire d'allocations
-- concurrentes ne calcule le meme numero.
create or replace function public.allocate_sku(p_user_id uuid, p_listing_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_sku integer;
  max_taken integer;
  next_sku integer;
begin
  if auth.uid() is null or auth.uid() != p_user_id then
    raise exception 'not authorized';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  select sku into existing_sku
  from listing_skus
  where listing_id = p_listing_id and status = 'active';
  if existing_sku is not null then
    return existing_sku;
  end if;

  select coalesce(max(sku), 0) into max_taken
  from listing_skus
  where user_id = p_user_id and status = 'active';

  select min(candidate) into next_sku
  from generate_series(1, max_taken + 1) as candidate
  where not exists (
    select 1 from listing_skus
    where user_id = p_user_id and sku = candidate and status = 'active'
  );

  insert into listing_skus (user_id, sku, listing_id, status)
  values (p_user_id, next_sku, p_listing_id, 'active');

  return next_sku;
end;
$$;

revoke execute on function public.allocate_sku(uuid, uuid) from anon;
revoke execute on function public.allocate_sku(uuid, uuid) from public;
grant execute on function public.allocate_sku(uuid, uuid) to authenticated;

-- release_sku_for_listing : liberation atomique. Aucune verification
-- auth.uid() explicite ici -- cette fonction n'est appelee QUE par le
-- trigger AFTER UPDATE ci-dessous, lui-meme declenche uniquement par une
-- mise a jour de `listings` deja autorisee par la RLS existante sur cette
-- table (auth.uid() = user_id) : la verification a deja eu lieu en amont,
-- la dupliquer ici n'ajouterait aucune garantie reelle.
create or replace function public.release_sku_for_listing(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update listing_skus
  set status = 'released', released_at = now()
  where listing_id = p_listing_id and status = 'active';
end;
$$;

revoke execute on function public.release_sku_for_listing(uuid) from anon;
revoke execute on function public.release_sku_for_listing(uuid) from public;
grant execute on function public.release_sku_for_listing(uuid) to authenticated;

-- validate_sku_consistency : diagnostic en LECTURE SEULE, jamais d'ecriture.
-- Signale : actif sans entree registre active, listings.sku desynchronise
-- du registre, titre encore suffixe d'un "#N", doublon actif (ne devrait
-- structurellement jamais arriver grace a l'index unique -- verification
-- redondante volontaire, defense en profondeur).
create or replace function public.validate_sku_consistency(p_user_id uuid)
returns table (issue_type text, listing_id uuid, detail text)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if auth.uid() is null or auth.uid() != p_user_id then
    raise exception 'not authorized';
  end if;

  return query
  select 'missing_sku'::text, l.id, l.title
  from listings l
  where l.user_id = p_user_id
    and l.status <> 'vendu' and l.vinted_status is distinct from 'deleted'
    and not exists (select 1 from listing_skus s where s.listing_id = l.id and s.status = 'active')

  union all

  select 'denormalized_mismatch'::text, l.id,
    format('listings.sku=%s registre=%s', l.sku, s.sku)
  from listings l
  join listing_skus s on s.listing_id = l.id and s.status = 'active'
  where l.user_id = p_user_id and l.sku is distinct from s.sku

  union all

  select 'title_has_sku_suffix'::text, l.id, l.title
  from listings l
  where l.user_id = p_user_id and l.title ~ '#\d+\s*$'

  union all

  select 'duplicate_active_sku'::text, l.id, format('sku=%s partage', s.sku)
  from listing_skus s
  join (
    select user_id, sku from listing_skus
    where status = 'active' group by user_id, sku having count(*) > 1
  ) d on d.user_id = s.user_id and d.sku = s.sku
  where s.status = 'active' and s.user_id = p_user_id;
end;
$$;

revoke execute on function public.validate_sku_consistency(uuid) from anon;
revoke execute on function public.validate_sku_consistency(uuid) from public;
grant execute on function public.validate_sku_consistency(uuid) to authenticated;

-- repair_sku_inconsistencies : corrige UNIQUEMENT les cas sans ambiguite
-- (demande explicite : "le systeme ne doit jamais modifier automatiquement
-- un SKU valide") :
-- 1) nettoie tout titre encore suffixe d'un ou plusieurs "#N" (jamais
--    ambigu : le titre ResellOS ne doit jamais porter de SKU) ;
-- 2) alloue un SKU aux annonces ACTIVES qui n'en ont pas (jamais aux
--    inactives) ;
-- 3) resynchronise listings.sku si desaligne du registre (le registre est
--    TOUJOURS autoritaire, jamais l'inverse) ;
-- 4) signale les doublons SANS jamais les corriger silencieusement --
--    retourne 'duplicate_flagged_manual_review', laisse a un humain le
--    choix de qui garde le numero.
-- Destinee a etre appelee par l'application a chaque synchronisation
-- importante (import, publication, modification, sync Vinted, demarrage) --
-- integration cote app/extension a cabler dans un chantier ulterieur,
-- pas dans cette migration.
create or replace function public.repair_sku_inconsistencies(p_user_id uuid)
returns table (action text, listing_id uuid, detail text)
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  new_sku integer;
begin
  if auth.uid() is null or auth.uid() != p_user_id then
    raise exception 'not authorized';
  end if;

  for rec in
    select id, title from listings
    where user_id = p_user_id and title ~ '#\d+\s*$'
  loop
    update listings
    set title = regexp_replace(rec.title, '(\s*#\d+\s*)+$', '')
    where id = rec.id;
    action := 'title_cleaned'; listing_id := rec.id; detail := rec.title;
    return next;
  end loop;

  for rec in
    select l.id from listings l
    where l.user_id = p_user_id
      and l.status <> 'vendu' and l.vinted_status is distinct from 'deleted'
      and not exists (select 1 from listing_skus s where s.listing_id = l.id and s.status = 'active')
  loop
    new_sku := public.allocate_sku(p_user_id, rec.id);
    update listings set sku = new_sku where id = rec.id;
    action := 'sku_allocated'; listing_id := rec.id; detail := new_sku::text;
    return next;
  end loop;

  for rec in
    select l.id, s.sku from listings l
    join listing_skus s on s.listing_id = l.id and s.status = 'active'
    where l.user_id = p_user_id and l.sku is distinct from s.sku
  loop
    update listings set sku = rec.sku where id = rec.id;
    action := 'denormalized_resynced'; listing_id := rec.id; detail := rec.sku::text;
    return next;
  end loop;

  for rec in
    select l.id, s.sku from listing_skus s
    join listings l on l.id = s.listing_id
    join (
      select user_id, sku from listing_skus
      where status = 'active' group by user_id, sku having count(*) > 1
    ) d on d.user_id = s.user_id and d.sku = s.sku
    where s.status = 'active' and s.user_id = p_user_id
  loop
    action := 'duplicate_flagged_manual_review'; listing_id := rec.id; detail := rec.sku::text;
    return next;
  end loop;
end;
$$;

revoke execute on function public.repair_sku_inconsistencies(uuid) from anon;
revoke execute on function public.repair_sku_inconsistencies(uuid) from public;
grant execute on function public.repair_sku_inconsistencies(uuid) to authenticated;

-- ============================================================
-- 3. Triggers
-- ============================================================

-- BEFORE INSERT : remplace assign_sku_before_insert (qui appelait l'ancien
-- allocate_next_sku, calcule directement sur listings) -- meme garde
-- (n'agit que si NEW.sku est deja null), alloue desormais via le registre.
-- NEW.id est deja disponible ici (le defaut gen_random_uuid() est applique
-- avant qu'un trigger BEFORE ne s'execute).
create or replace function public.assign_sku_before_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.sku is null then
    new.sku := public.allocate_sku(new.user_id, new.id);
  end if;
  return new;
end;
$$;

-- AFTER UPDATE : liberation EXPLICITE, uniquement sur transition reelle vers
-- vente definitive ou suppression definitive -- jamais sur reserve/vente en
-- cours.
create or replace function public.release_sku_after_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.status = 'vendu' and old.status is distinct from 'vendu')
     or (new.vinted_status = 'deleted' and old.vinted_status is distinct from 'deleted') then
    perform public.release_sku_for_listing(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_release_sku_after_update on public.listings;
create trigger trg_release_sku_after_update
  after update on public.listings
  for each row
  execute function public.release_sku_after_update();

-- ============================================================
-- 4. Verrouillage colonne
-- ============================================================

-- (2026-07-26, "aucun autre module ne doit creer ou modifier directement un
-- SKU") : meme discipline REVOKE colonne (pas table) deja etablie pour les
-- colonnes de facturation, voir 20260711090000_lock_billing_columns.sql. Un
-- trigger BEFORE modifiant NEW.sku n'est PAS soumis aux privileges colonne
-- du client (Postgres ne verifie les privileges colonne que sur les
-- colonnes explicitement listees dans l'INSERT/UPDATE du client) -- ce
-- revoke n'affecte donc jamais le trigger, seulement une tentative directe
-- de l'application de fixer listings.sku elle-meme.
revoke insert (sku), update (sku) on public.listings from authenticated;

-- ============================================================
-- 5. Migration de donnees (execution unique)
-- ============================================================

-- 5a) Suppression des 2 lignes de test sandbox (identifiants confirmes lors
-- de l'audit du 2026-07-26 -- titres "Planche en bois test titre final #11
-- #11" et "Planche en bois test3#11 #11").
delete from public.listings
where id in (
  'a329121d-d8dc-4ff1-a780-2b48dc2f4891',
  '4bc41b82-fdc6-489a-91af-ee927f0b29b1'
);

-- 5b) Nettoyage de tous les titres (le meme regex gere aussi un suffixe
-- double type "#11 #11" en un seul remplacement).
update public.listings
set title = regexp_replace(title, '(\s*#\d+\s*)+$', '')
where title ~ '#\d+\s*$';

-- 5c) Backfill du registre depuis les sku valides existants. Pour chaque
-- (user_id, sku) actif duplique (aucun trouve lors du dry run du
-- 2026-07-26, gere defensivement), seule la ligne la plus ancienne
-- (created_at puis id) est retenue. Le filtre "not exists" rend cette
-- insertion idempotente : sur un second passage, ces listings ont deja une
-- entree active dans le registre (creee au premier passage) et sont donc
-- ignores plutot que de tenter une insertion en doublon (demande explicite
-- 2026-07-26, "aucune modification supplementaire apres la premiere
-- execution").
with active_listings as (
  select id, user_id, sku, created_at,
    row_number() over (partition by user_id, sku order by created_at asc, id asc) as rn
  from public.listings l
  where status <> 'vendu'
    and vinted_status is distinct from 'deleted'
    and sku is not null
    and sku > 0
    and not exists (
      select 1 from public.listing_skus s where s.listing_id = l.id and s.status = 'active'
    )
)
insert into public.listing_skus (user_id, sku, listing_id, status)
select user_id, sku, id, 'active'
from active_listings
where rn = 1;

-- 5d) Les lignes ecartees par le rn>1 ci-dessus (doublon perdant) repartent
-- de listings.sku = null pour etre detectees et reallouees a l'etape 5e.
update public.listings l
set sku = null
where l.id in (
  select id from (
    select id, user_id, sku,
      row_number() over (partition by user_id, sku order by created_at asc, id asc) as rn
    from public.listings
    where status <> 'vendu' and vinted_status is distinct from 'deleted' and sku is not null and sku > 0
  ) ranked
  where rn > 1
);

-- 5e) Alloue un sku aux annonces actives sans entree registre. N'appelle PAS
-- repair_sku_inconsistencies()/allocate_sku() ici : ces fonctions
-- verifient auth.uid() = p_user_id (protection correcte pour un appel
-- authentifie normal), mais auth.uid() vaut NULL dans le contexte d'une
-- migration brute (aucune session utilisateur) -- l'appel echouerait
-- systematiquement. Cette migration tourne deja avec des privileges
-- complets, donc reproduit ici le MEME algorithme (plus petit entier libre,
-- ordre created_at puis id) sans le garde-fou d'authentification, qui n'a
-- de sens que pour la surface RPC exposee au client.
do $$
declare
  uid uuid;
  rec record;
  max_taken integer;
  next_sku integer;
begin
  for uid in select distinct user_id from public.listings loop
    for rec in
      select l.id from public.listings l
      where l.user_id = uid
        and l.status <> 'vendu' and l.vinted_status is distinct from 'deleted'
        and not exists (select 1 from public.listing_skus s where s.listing_id = l.id and s.status = 'active')
      order by l.created_at asc, l.id asc
    loop
      select coalesce(max(sku), 0) into max_taken
      from public.listing_skus where user_id = uid and status = 'active';

      select min(candidate) into next_sku
      from generate_series(1, max_taken + 1) as candidate
      where not exists (
        select 1 from public.listing_skus where user_id = uid and sku = candidate and status = 'active'
      );

      insert into public.listing_skus (user_id, sku, listing_id, status) values (uid, next_sku, rec.id, 'active');
      update public.listings set sku = next_sku where id = rec.id;
    end loop;
  end loop;
end $$;
