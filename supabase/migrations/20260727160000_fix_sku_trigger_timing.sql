-- Correctif d'un bug reel confirme le 2026-07-27 (rapporte par l'utilisateur
-- : une annonce Vinted reelle disparaissait de ResellOS apres synchro,
-- diagnostic en direct via le journal de l'extension puis reproduit dans
-- une transaction annulee, message identique octet pour octet) :
--
--   ERROR: 23503 insert or update on table "listing_skus" violates foreign
--   key constraint "listing_skus_listing_id_fkey"
--   DETAIL: Key (listing_id)=(...) is not present in table "listings".
--
-- Cause racine : trg_assign_sku_before_insert (BEFORE INSERT sur listings,
-- cree le 2026-07-13 dans 20260713120000_add_listing_sku.sql) appelait a
-- l'origine allocate_next_sku(), qui ne fait qu'un calcul en lecture sur
-- listings -- aucun probleme d'ordre. Le 2026-07-26
-- (20260726200000_add_sku_registry_and_migrate.sql), la fonction
-- assign_sku_before_insert() a ete remplacee (CREATE OR REPLACE, sans
-- jamais recreer le trigger lui-meme) pour appeler allocate_sku() a la
-- place -- qui, LUI, insere dans listing_skus en referencant
-- listing_id = NEW.id. En contexte BEFORE INSERT, la ligne listings elle-
-- meme n'existe PAS ENCORE dans la table (elle n'est ecrite qu'apres le
-- retour du trigger) -- la contrainte de cle etrangere echoue donc
-- systematiquement des qu'un NOUVEL enregistrement est insere sans sku
-- deja fourni (synchro passive en masse, import, Generateur). Regression
-- silencieuse : aucune erreur visible cote utilisateur avant ce diagnostic
-- car extension/src/content/vinted-profile.ts avalait l'echec de
-- LISTINGS_DETECTED sans le journaliser (corrige separement le meme jour).
--
-- Fix : la meme logique tourne desormais en AFTER INSERT -- a ce moment,
-- la ligne listings existe reellement et est visible dans la meme
-- transaction, le insert imbrique dans listing_skus peut donc satisfaire
-- sa FK. Un trigger AFTER ne peut pas modifier NEW via RETURN (ignore pour
-- un AFTER ROW) -- un UPDATE explicite de la ligne fraichement inseree fait
-- le travail a la place. Ce UPDATE ne touche que la colonne sku, donc ne
-- declenche jamais trg_release_sku_after_update (qui ne reagit qu'a une
-- transition reelle de status/vinted_status).

drop trigger if exists trg_assign_sku_before_insert on public.listings;

create or replace function public.assign_sku_after_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  allocated_sku integer;
begin
  if new.sku is null then
    allocated_sku := public.allocate_sku(new.user_id, new.id);
    update listings set sku = allocated_sku where id = new.id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_assign_sku_after_insert on public.listings;
create trigger trg_assign_sku_after_insert
  after insert on public.listings
  for each row
  execute function public.assign_sku_after_insert();

-- assign_sku_before_insert() n'est plus liee a aucun trigger -- laissee
-- telle quelle (pas de DROP FUNCTION), desormais totalement inerte.
