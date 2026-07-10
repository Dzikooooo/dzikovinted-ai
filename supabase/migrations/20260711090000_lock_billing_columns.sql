-- P0.1 (audit pre-lancement) : le role authenticated pouvait modifier
-- directement profiles.plan / profiles.credits / usage.analyses_count /
-- subscriptions.* depuis le client (RLS seule les protegeait, et RLS ne
-- restreint pas les colonnes -- seulement les lignes). Confirme exploitable
-- en direct le 2026-07-11 : un simple `supabase.from('profiles').update({
-- plan:'pro', credits:999999})` depuis la console du navigateur suffisait.
--
-- Principe retenu : les colonnes sensibles (plan/credits/abonnement) ne
-- doivent plus jamais etre ecrites par une requete authenticated directe.
-- Seules des fonctions SECURITY DEFINER (decrement_credit/increment_usage/
-- refund_credit, toutes deja verifiees auth.uid() = p_user_id) ou, plus
-- tard, un webhook Stripe tournant en service_role peuvent les modifier --
-- ces deux chemins tournent avec les privileges du proprietaire de la
-- fonction/du role service_role, donc ne sont pas affectes par les REVOKE
-- ci-dessous.

-- ─── PROFILES ────────────────────────────────────────────────────────────────
-- Seul full_name est reellement edite par l'app (SettingsPage.tsx). Tout le
-- reste (plan, credits, email, avatar_url) devient illisible en ecriture
-- directe pour authenticated -- lecture (SELECT) inchangee.

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name) ON public.profiles TO authenticated;

-- Garde-fou manquant en prod (present dans la migration d'origine mais
-- absent de la base reelle -- derive de schema documentee dans DATABASE.md).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_plan_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_plan_check CHECK (plan IN ('free','pro','team'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_credits_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_credits_check CHECK (credits >= 0);
  END IF;
END $$;

-- Policies dupliquees heritees (roles {public}, memes conditions que les
-- policies *_own_profile en {authenticated}) -- deja signalees par Supabase
-- Advisors (multiple_permissive_policies). Suppression sans changement de
-- comportement : {authenticated} est un sous-ensemble de {public} et les
-- policies restantes couvrent exactement le meme cas (auth.uid() = id).
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- ─── USAGE ────────────────────────────────────────────────────────────────────
-- Compteur de suivi mensuel -- ne doit etre modifie que par increment_usage.

REVOKE UPDATE (analyses_count) ON public.usage FROM authenticated;

-- ─── SUBSCRIPTIONS ──────────────────────────────────────────────────────────
-- Table pas encore branchee a Stripe (SubscriptionPage.tsx n'a aucun appel
-- Stripe a ce jour) mais deviendra la source de verite de facturation.
-- Verrouillee par anticipation : lecture seule pour le proprietaire, toute
-- ecriture future viendra d'un webhook Stripe en service_role (qui
-- contourne RLS/grants, donc aucun acces authenticated n'est necessaire).

DROP POLICY IF EXISTS "insert_own_subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "update_own_subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "delete_own_subscriptions" ON public.subscriptions;

REVOKE INSERT, UPDATE, DELETE ON public.subscriptions FROM authenticated;

-- ─── decrement_credit : distinguer "consomme" de "deja a zero" ────────────────
-- Avant : "floor" silencieux a 0, aucun moyen pour l'appelant de savoir si
-- le credit a reellement ete consomme. Necessaire pour permettre une
-- reservation atomique cote edge function (reserver AVANT l'appel Gemini,
-- rembourser si Gemini echoue).

CREATE OR REPLACE FUNCTION public.decrement_credit(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_credits integer;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE profiles
  SET credits = credits - 1
  WHERE id = p_user_id AND credits > 0
  RETURNING credits INTO new_credits;

  IF new_credits IS NULL THEN
    RAISE EXCEPTION 'insufficient_credits';
  END IF;

  RETURN new_credits;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.decrement_credit(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.decrement_credit(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.decrement_credit(uuid) TO authenticated;

-- Symetrique de decrement_credit -- rembourse une reservation quand l'appel
-- Gemini echoue apres coup.
CREATE OR REPLACE FUNCTION public.refund_credit(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_credits integer;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE profiles
  SET credits = credits + 1
  WHERE id = p_user_id
  RETURNING credits INTO new_credits;

  RETURN COALESCE(new_credits, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refund_credit(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refund_credit(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.refund_credit(uuid) TO authenticated;
