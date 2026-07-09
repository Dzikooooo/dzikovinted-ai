-- Unifie `listings` (articles crees dans ResellOS, prix d'achat/frais/statut
-- de vente) et `vinted_listings` (miroir Vinted reel par compte) en un seul
-- modele : une annonce Vinted EST desormais la meme ligne que l'article
-- ResellOS correspondant, plus deux tables jointes. Demande explicite de
-- l'utilisateur : "je veux eviter les doublons de donnees".
--
-- Deux axes de statut distincts coexistent sur la meme ligne :
-- - `status` (existant : draft/en_stock/vendu) - statut workflow ResellOS,
--   propriete de l'utilisateur.
-- - `vinted_status` (nouveau, nullable) - etat reel observe sur Vinted
--   (online/reserved/sold_pending/sold_completed/draft/hidden/deleted/
--   unknown), propriete de la synchro. NULL = jamais lie a un compte Vinted
--   (brouillon pur Generateur, jamais publie).

alter table listings add column if not exists vinted_account_id uuid references vinted_accounts(id) on delete set null;
alter table listings add column if not exists vinted_item_id text;
alter table listings add column if not exists vinted_url text;
alter table listings add column if not exists vinted_status text;
alter table listings add column if not exists favourites integer;
alter table listings add column if not exists views integer;
alter table listings add column if not exists synced_at timestamptz;

-- Colonne texte morte : jamais lue par aucun code (confirme par l'audit de
-- juillet 2026), remplacee par vinted_account_id (vraie FK) - deux notions
-- de "compte" ne doivent pas coexister.
alter table listings drop column if exists account;

-- Autorise l'upsert par (compte, item) tout en laissant coexister plusieurs
-- lignes a vinted_item_id null (brouillons jamais publies).
create unique index if not exists listings_vinted_account_item_unique
  on listings (vinted_account_id, vinted_item_id)
  where vinted_item_id is not null;

-- Migration des donnees : chaque ligne vinted_listings devient une ligne
-- listings. purchase_price reste NULL (information reellement inconnue,
-- jamais saisie par l'utilisateur pour un article decouvert via Vinted -
-- pas de donnee inventee).
insert into listings (
  user_id, vinted_account_id, vinted_item_id, title, brand, size, price,
  image_urls, vinted_url, vinted_status, favourites, views, synced_at,
  status, sold_date, sold_price, purchase_price, fees, is_favorite
)
select
  va.user_id,
  vl.vinted_account_id,
  vl.vinted_item_id,
  vl.title,
  vl.brand,
  vl.size,
  vl.price,
  case when vl.image_url is not null then jsonb_build_array(vl.image_url) else '[]'::jsonb end,
  vl.vinted_url,
  vl.status,
  vl.favourites,
  vl.views,
  vl.synced_at,
  case
    when vl.status = 'sold_completed' then 'vendu'
    when vl.status = 'draft' then 'draft'
    else 'en_stock'
  end,
  case when vl.status = 'sold_completed' then vl.synced_at::date else null end,
  case when vl.status = 'sold_completed' then vl.price else null end,
  null,
  0,
  false
from vinted_listings vl
join vinted_accounts va on va.id = vl.vinted_account_id
on conflict (vinted_account_id, vinted_item_id) where vinted_item_id is not null do nothing;

-- Pas de DROP definitif : filet de securite peu couteux le temps de valider
-- en conditions reelles. A supprimer pour de bon dans une migration
-- ulterieure une fois confirme stable.
alter table vinted_listings rename to vinted_listings_deprecated_20260709;
