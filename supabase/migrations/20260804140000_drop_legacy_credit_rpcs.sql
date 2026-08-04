-- ETAPE 2/2 (P-02, revue du 2026-08-04) : a pousser SEULEMENT apres que la
-- nouvelle version de l'edge function analyze-clothing (reserve_credit/
-- consume_credit_reservation/refund_credit_reservation, deployee au terme
-- de l'etape 1, voir 20260804130000_fix_refund_credit_reservation.sql) a
-- ete verifiee en production sur au moins une generation reussie ET une
-- generation echouee/remboursee. Avant cette verification, decrement_credit
-- et refund_credit doivent rester en place (retrocompatibilite le temps du
-- deploiement de la fonction Edge).
--
-- Supprime les deux RPC remplaces -- plus aucun appelant dans le repo une
-- fois l'edge function migree (grep confirme : seul analyze-clothing/
-- index.ts les utilisait). Supprimees plutot que laissees mortes pour
-- qu'aucun appel direct devtools ne puisse plus s'en servir (c'etait
-- exactement le vecteur du bug P-02 d'origine).

DROP FUNCTION IF EXISTS public.decrement_credit(uuid);
DROP FUNCTION IF EXISTS public.refund_credit(uuid);
