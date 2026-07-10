-- Correctif immediat de 20260711090000_lock_billing_columns.sql : le
-- REVOKE UPDATE (analyses_count) ON usage FROM authenticated n'avait AUCUN
-- effet. Confirme en testant un contournement juste apres le push : le
-- privilege UPDATE etait accorde au niveau de la TABLE (information_schema.
-- table_privileges), pas au niveau de la colonne -- un REVOKE colonne par
-- colonne ne peut pas retirer un privilege accorde au niveau table (deux
-- ACL Postgres distinctes, relacl vs attacl). Seul un REVOKE au niveau
-- table le retire vraiment, comme ca a fonctionne pour profiles.
--
-- Aucun code client n'ecrit directement dans `usage` (verifie par grep --
-- seule la RPC increment_usage y ecrit, SECURITY DEFINER, non affectee par
-- ce REVOKE), donc pas de re-GRANT partiel necessaire ici contrairement a
-- profiles.full_name.

REVOKE UPDATE ON public.usage FROM authenticated;
