-- Corrige une recursion infinie decouverte en testant le commit E (Admin
-- panel, 2026-08-04) : is_admin() interroge public.profiles, et la policy
-- "admins can view all profiles" (ajoutee dans 20260804120000) appelle
-- is_admin() -- comme is_admin() n'etait pas SECURITY DEFINER, sa requete
-- interne etait elle-meme soumise aux RLS de profiles, qui reevaluait la
-- meme policy, qui rappelait is_admin(), etc. Postgres finit par lever
-- "stack depth limit exceeded" (54001).
--
-- Confirme en prod (transactions BEGIN...ROLLBACK, comptes de test
-- jetables, aucune trace laissee) : SELECT sur profiles pour une ligne
-- autre que la sienne plantait pour TOUT utilisateur authenticated --
-- admin ou non-admin. AdminUsersPage.tsx fait exactement ce SELECT
-- (`.from('profiles').select('*')`, sans filtre) pour lister les
-- utilisateurs -- la liste admin etait donc cassee, meme pour un vrai
-- admin. Les RPC admin_set_user_banned/admin_set_user_plan (deja
-- SECURITY DEFINER) n'etaient pas affectees.
--
-- Correctif standard pour ce pattern RLS : marquer is_admin() SECURITY
-- DEFINER (meme discipline que admin_set_user_banned/admin_set_user_plan)
-- -- sa requete interne s'execute alors avec les privileges du proprietaire
-- de la fonction, hors RLS, rompant la boucle. Verifie en transaction
-- ROLLBACK avant application reelle : non-admin lisant un profil externe ->
-- 0 ligne proprement (pas de crash) ; admin reel listant plusieurs profils
-- -> toutes les lignes visibles (pas de crash).

create or replace function public.is_admin()
 returns boolean
 language sql
 stable
 security definer
 set search_path = public
as $function$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$function$;
