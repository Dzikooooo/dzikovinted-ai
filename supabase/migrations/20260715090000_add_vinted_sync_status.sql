-- Demande explicite du 2026-07-15 : le prix modifie dans ResellOS restait
-- affiche localement comme "a jour" alors que le push vers Vinted n'avait
-- jamais ete confirme (voire pouvait etre silencieusement ecrase par une
-- synchro/import ulterieure qui refletait l'ancien prix Vinted -- bug
-- reel constate : recordListings() rafraichit price a CHAQUE synchro
-- passive par design d'origine, recordSingleItemImport() ecrase tous les
-- champs a CHAQUE import deliberer -- aucun des deux ne savait qu'un
-- brouillon local non synchronise existait).
--
-- vinted_sync_status distingue desormais l'etat REEL de synchronisation
-- sortante (ResellOS -> Vinted) d'une simple presence de donnees :
--   NULL          -- pas de brouillon local en attente (etat par defaut,
--                    y compris pour toute ligne jamais editee depuis
--                    ResellOS -- import/synchro Vinted -> ResellOS peuvent
--                    ecrire librement).
--   sync_pending  -- une modification locale (prix/titre/description...)
--                    a ete enregistree mais pas encore confirmee sur
--                    Vinted -- import/synchro doivent alors PROTEGER les
--                    champs proprietaires de ce brouillon, jamais les
--                    ecraser silencieusement.
--   sync_success  -- le dernier push vers Vinted a ete confirme.
--   sync_failed   -- le dernier push a echoue -- la valeur locale reste
--                    affichee (brouillon conserve), mais ne doit jamais
--                    laisser croire que Vinted a ete mis a jour.
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS vinted_sync_status text
  CHECK (vinted_sync_status IN ('sync_pending', 'sync_success', 'sync_failed'));
