CREATE OR REPLACE FUNCTION public.decrement_credit(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_credits integer;
BEGIN
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