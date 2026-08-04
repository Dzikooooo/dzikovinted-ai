-- P-02 (audit pre-beta 2026-08-03) : refund_credit ne verifiait que
-- auth.uid() = p_user_id, jamais qu'un credit ait reellement ete reserve
-- au prealable par decrement_credit. Exploitable directement depuis la
-- console du navigateur : `supabase.rpc('refund_credit', {p_user_id: monId})`.
--
-- Un premier correctif (compteur pending_credit_reservations sur profiles)
-- a ete propose puis rejete en revue : il incrementait a la reservation
-- mais ne decrementait JAMAIS au succes (analyze-clothing/index.ts n'a
-- aucun appel de finalisation sur son chemin de succes, verifie ligne
-- 279-329) -- ce qui rendait chaque generation reussie remboursable une
-- fois, gratuitement, indefiniment repetable.
--
-- Design retenu : reservation transactionnelle avec statut explicite
-- (pending/consumed/refunded), sur une table dediee plutot qu'un simple
-- compteur. Garantie centrale : le reservation_id (uuid aleatoire) n'est
-- JAMAIS renvoye au client -- il ne vit que dans le contexte d'execution
-- serveur de l'edge function entre la reservation et sa cloture. Un client
-- ne peut donc jamais fournir l'id de SA PROPRE reservation en cours pour
-- la rembourser en parallele de sa propre generation. Combine a des
-- transitions de statut par UPDATE ... WHERE status = 'pending' (atomique
-- par ligne en Postgres), ca rend consume/refund idempotents et surs en
-- cas de retry ou d'appel concurrent : seul le premier appelant a trouver
-- la ligne encore 'pending' peut la faire transitionner, tous les suivants
-- ne trouvent plus rien a mettre a jour (no-op silencieux, jamais une
-- double ecriture de credit).
--
-- ETAPE 1/2 (revue du 2026-08-04) : migration purement additive, retro-
-- compatible. decrement_credit/refund_credit restent en place et
-- utilisables tels quels -- l'edge function analyze-clothing actuellement
-- deployee continue de fonctionner sans interruption pendant que cette
-- migration est poussee. Elles ne seront supprimees que par une seconde
-- migration separee (20260804140000_drop_legacy_credit_rpcs.sql), apres
-- deploiement et verification manuelle de la nouvelle version de l'edge
-- function qui utilise reserve_credit/consume_credit_reservation/
-- refund_credit_reservation. Objectif : jamais de fenetre ou les deux
-- versions de l'edge function (l'ancienne en cache/en cours d'execution,
-- la nouvelle fraichement deployee) pourraient coexister sans que les RPC
-- dont chacune a besoin existent toutes les deux.
--
-- REVISION (revue du 2026-08-04, 2e passe) : la premiere version de cette
-- etape laissait les 3 RPC accessibles a `authenticated` (comme
-- decrement_credit/refund_credit avant elles) plus une policy SELECT sur
-- credit_reservations pour son propre proprietaire. Faille trouvee en
-- revue : meme sans jamais renvoyer reservation_id dans une Response, un
-- client authentifie pouvait le lire directement via
-- `supabase.from('credit_reservations').select()` PENDANT qu'une
-- generation etait en cours (reservation encore 'pending'), puis appeler
-- refund_credit_reservation() depuis les DevTools en parallele de sa
-- propre requete Gemini -- recuperant son credit tout en recevant
-- potentiellement quand meme le resultat si l'edge function ne verifiait
-- pas strictement le retour de consume_credit_reservation().
--
-- Correctif : les 3 RPC ne sont plus appelables QUE par `service_role`
-- (revoke total pour anon/authenticated/public), donc plus jamais
-- atteignables depuis le navigateur -- seule l'edge function
-- analyze-clothing, avec un client service_role distinct du client
-- authentifie utilisateur, peut les invoquer, apres avoir elle-meme
-- verifie le JWT. auth.uid() ne resout a rien sous un contexte
-- service_role (aucun JWT utilisateur associe a cette connexion) --
-- consume_credit_reservation/refund_credit_reservation recoivent donc
-- desormais p_user_id explicitement en parametre, fourni par l'edge
-- function apres verification d'identite, et l'utilisent dans la clause
-- WHERE a la place de auth.uid(). La policy SELECT sur
-- credit_reservations est supprimee (aucun besoin metier reel : rien cote
-- client n'a jamais eu besoin de lire cette table directement).

CREATE TABLE IF NOT EXISTS public.credit_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'consumed', 'refunded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_credit_reservations_user_status
  ON public.credit_reservations (user_id, status);

ALTER TABLE public.credit_reservations ENABLE ROW LEVEL SECURITY;

-- Aucune policy du tout, pour aucun role PostgREST (anon/authenticated) --
-- RLS activee + zero policy = deny par defaut pour select/insert/update/
-- delete. Table strictement interne : jamais lue ni ecrite directement par
-- un client, uniquement via les fonctions SECURITY DEFINER ci-dessous
-- (qui tournent avec les privileges du proprietaire de la fonction, donc
-- pas soumises a cette RLS) elles-memes appelables seulement par
-- service_role (voir GRANT/REVOKE plus bas).

-- Reserve un credit : decremente profiles.credits (meme garde credits > 0
-- que l'ancien decrement_credit) et cree une reservation 'pending'. Les
-- deux ecritures sont dans la meme fonction PL/pgSQL, donc dans la meme
-- transaction implicite -- pas d'etat incoherent possible entre les deux.
-- p_user_id est fourni par l'edge function APRES verification du JWT --
-- auth.uid() ne resout a rien sous un appel service_role (aucune session
-- utilisateur associee a cette connexion), la garantie d'identite vient
-- desormais entierement du fait que seul service_role peut appeler cette
-- fonction, jamais un utilisateur authenticated directement.
CREATE OR REPLACE FUNCTION public.reserve_credit(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_credits integer;
  v_reservation_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE profiles
  SET credits = credits - 1
  WHERE id = p_user_id AND credits > 0
  RETURNING credits INTO new_credits;

  IF new_credits IS NULL THEN
    RAISE EXCEPTION 'insufficient_credits';
  END IF;

  INSERT INTO credit_reservations (user_id, status)
  VALUES (p_user_id, 'pending')
  RETURNING id INTO v_reservation_id;

  RETURN v_reservation_id;
END;
$$;

-- Cloture une reservation apres une generation reussie -- ne touche jamais
-- profiles.credits (le credit a deja ete consomme a la reservation), sert
-- uniquement a marquer la reservation comme definitivement close pour que
-- refund_credit_reservation ne puisse plus jamais agir dessus. Idempotent :
-- un second appel (retry reseau cote edge function) ne trouve plus la ligne
-- en 'pending' et ne fait rien. p_user_id : meme raisonnement que
-- reserve_credit, verifie explicitement contre credit_reservations.user_id
-- dans le WHERE plutot que via auth.uid().
CREATE OR REPLACE FUNCTION public.consume_credit_reservation(p_reservation_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE credit_reservations
  SET status = 'consumed', resolved_at = now()
  WHERE id = p_reservation_id AND user_id = p_user_id AND status = 'pending';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

-- Rembourse une reservation apres un echec (Gemini indisponible, reponse
-- vide, exception non geree). Ne credite profiles.credits QUE si la
-- transition pending -> refunded a reellement eu lieu (v_user_id non nul) --
-- une reservation deja consumed/refunded, inexistante, ou n'appartenant pas
-- a l'appelant produit un no-op silencieux (retourne NULL), jamais un
-- credit accorde a tort.
CREATE OR REPLACE FUNCTION public.refund_credit_reservation(p_reservation_id uuid, p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  new_credits integer;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE credit_reservations
  SET status = 'refunded', resolved_at = now()
  WHERE id = p_reservation_id AND user_id = p_user_id AND status = 'pending'
  RETURNING user_id INTO v_user_id;

  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE profiles
  SET credits = credits + 1
  WHERE id = v_user_id
  RETURNING credits INTO new_credits;

  RETURN new_credits;
END;
$$;

-- Reachable UNIQUEMENT par service_role -- jamais anon/authenticated/public.
-- C'est la garantie centrale de cette revision : meme en connaissant un
-- reservation_id valide (fuite hypothetique, id devine), le navigateur
-- d'un utilisateur authentifie n'a plus aucun moyen d'appeler ces 3
-- fonctions, PostgREST refusera avec "permission denied for function ...".
REVOKE EXECUTE ON FUNCTION public.reserve_credit(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reserve_credit(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reserve_credit(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_credit(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.consume_credit_reservation(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.consume_credit_reservation(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.consume_credit_reservation(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_credit_reservation(uuid, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.refund_credit_reservation(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refund_credit_reservation(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refund_credit_reservation(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.refund_credit_reservation(uuid, uuid) TO service_role;

-- decrement_credit et refund_credit sont VOLONTAIREMENT laissees intactes
-- ici -- voir migration 20260804140000_drop_legacy_credit_rpcs.sql pour
-- leur suppression, a pousser separement une fois la nouvelle edge
-- function verifiee en production (2 generations reelles : succes + echec).
