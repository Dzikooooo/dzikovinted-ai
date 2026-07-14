-- BUG REEL trouve en import reel le 2026-07-14 : "duplicate key value
-- violates unique constraint listings_user_sku_unique" (code 23505) des le
-- premier import d'un article pourtant jamais vu auparavant.
--
-- Cause racine : l'index unique cree par 20260713120000_add_listing_sku.sql
-- portait sur (user_id, sku) WHERE sku IS NOT NULL -- SANS tenir compte du
-- statut de l'annonce. Mais allocate_next_sku() calcule le "plus petit sku
-- libre" en IGNORANT les annonces vendues/supprimees (status = 'vendu' OR
-- vinted_status = 'deleted') puisque, par design, un sku est cense se
-- liberer quand son annonce est vendue -- SANS jamais effacer le sku de la
-- ligne vendue/supprimee (l'historique doit rester lisible, voir le
-- commentaire d'origine). Resultat : allocate_next_sku() pouvait tres
-- legitimement re-proposer un numero deja porte par une vieille ligne
-- vendue/supprimee -- et l'index unique, lui, refusait ce doublon car il
-- ne faisait AUCUNE exception pour ces lignes-la. Les deux regles
-- (allocation "actif seulement" vs contrainte "toutes lignes") etaient
-- incoherentes entre elles.
--
-- Correction : l'index unique porte desormais EXACTEMENT sur le meme
-- perimetre que allocate_next_sku() -- annonces actives uniquement. Les
-- lignes vendues/supprimees peuvent desormais legitimement partager un
-- numero avec une annonce active plus recente (l'historique reste intact,
-- rien n'est jamais efface ni reecrit sur les vieilles lignes) ; deux
-- annonces ACTIVES ne peuvent en revanche toujours jamais partager le
-- meme sku. Si l'une de ces deux clauses WHERE change un jour, l'autre
-- doit changer a l'identique.

DROP INDEX IF EXISTS public.listings_user_sku_unique;

CREATE UNIQUE INDEX listings_user_sku_unique
  ON public.listings (user_id, sku)
  WHERE sku IS NOT NULL
    AND status <> 'vendu'
    AND vinted_status IS DISTINCT FROM 'deleted';
