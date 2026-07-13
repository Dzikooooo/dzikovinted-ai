-- Extension V1 (sprint import/modification) : chaque annonce recoit un SKU
-- numerique unique par utilisateur (#1, #2, #43...), attribue automatiquement
-- et jamais gere manuellement par l'utilisateur. Regles (voir plan) :
-- - numerotation unique par utilisateur, tous comptes Vinted confondus ;
-- - une annonce vendue ou supprimee libere son numero pour la prochaine
--   creation/import (le calcul ci-dessous ignore les lignes vendu/deleted,
--   sans jamais modifier retroactivement le sku deja enregistre sur ces
--   lignes -- l'historique reste lisible) ;
-- - le plus petit numero libre est toujours attribue en premier ; si aucun
--   trou n'existe, le numero suivant est utilise.

ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS sku integer;

-- Garde-fou DB en plus de la logique d'allocation ci-dessous -- meme
-- discipline que listings_vinted_account_item_unique (2026-07-09) : la
-- fonction d'allocation est le chemin normal, mais l'index empeche
-- physiquement un doublon meme en cas de bug ou d'ecriture directe.
CREATE UNIQUE INDEX IF NOT EXISTS listings_user_sku_unique
  ON public.listings (user_id, sku)
  WHERE sku IS NOT NULL;

-- Alloue le plus petit entier positif non utilise par une annonce ACTIVE
-- (ni vendue, ni supprimee cote Vinted) de cet utilisateur. Verrou
-- consultatif par utilisateur (releve automatiquement en fin de
-- transaction) pour qu'aucune paire d'insertions concurrentes ne calcule le
-- meme numero avant que la premiere n'ait committe.
CREATE OR REPLACE FUNCTION public.allocate_next_sku(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  max_taken integer;
  next_sku integer;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));

  SELECT COALESCE(MAX(sku), 0) INTO max_taken
  FROM listings
  WHERE user_id = p_user_id
    AND sku IS NOT NULL
    AND status <> 'vendu'
    AND vinted_status IS DISTINCT FROM 'deleted';

  SELECT MIN(candidate) INTO next_sku
  FROM generate_series(1, max_taken + 1) AS candidate
  WHERE NOT EXISTS (
    SELECT 1 FROM listings
    WHERE user_id = p_user_id
      AND sku = candidate
      AND status <> 'vendu'
      AND vinted_status IS DISTINCT FROM 'deleted'
  );

  RETURN next_sku;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.allocate_next_sku(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.allocate_next_sku(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.allocate_next_sku(uuid) TO authenticated;

-- Attribution automatique a la creation : couvre tous les chemins
-- d'insertion (Generateur, import extension, synchro en masse) sans qu'un
-- seul point d'appel ait besoin d'y penser. Un sku deja fourni explicitement
-- (reprise d'un numero deja present dans le titre Vinted importe, voir
-- extension/src/background/sync.ts) n'est jamais ecrase.
CREATE OR REPLACE FUNCTION public.assign_sku_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.sku IS NULL THEN
    NEW.sku := public.allocate_next_sku(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_sku_before_insert ON public.listings;
CREATE TRIGGER trg_assign_sku_before_insert
  BEFORE INSERT ON public.listings
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_sku_before_insert();
