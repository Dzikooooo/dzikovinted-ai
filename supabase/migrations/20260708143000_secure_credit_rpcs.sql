-- Faille de securite : decrement_credit et increment_usage sont SECURITY DEFINER
-- (bypass RLS) et etaient executables par le role anon (non authentifie) via
-- /rest/v1/rpc/..., SANS jamais verifier que p_user_id correspond a l'appelant.
-- N'importe qui, sans etre connecte, pouvait vider les credits de n'importe
-- quel autre utilisateur en boucle. Ajoute une verification auth.uid() =
-- p_user_id et retire l'acces anon. Fixe aussi search_path (recommandation
-- Postgres pour les fonctions SECURITY DEFINER, evite le hijacking de
-- search_path).

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
  SET credits = GREATEST(credits - 1, 0)
  WHERE id = p_user_id AND credits > 0
  RETURNING credits INTO new_credits;

  IF new_credits IS NULL THEN
    SELECT credits INTO new_credits FROM profiles WHERE id = p_user_id;
  END IF;

  RETURN COALESCE(new_credits, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.decrement_credit(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.decrement_credit(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.decrement_credit(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.increment_usage(p_user_id uuid, p_month text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  INSERT INTO usage (user_id, month, analyses_count)
  VALUES (p_user_id, p_month, 1)
  ON CONFLICT (user_id, month)
  DO UPDATE SET analyses_count = usage.analyses_count + 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_usage(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_usage(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.increment_usage(uuid, text) TO authenticated;

-- handle_new_user() est un trigger sur auth.users, jamais destine a etre
-- appele directement en RPC (il reference NEW, inutilisable hors contexte
-- de trigger -- inoffensif si appele, mais on retire quand meme l'acces
-- direct par hygiene).
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public;
