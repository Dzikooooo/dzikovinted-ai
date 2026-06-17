/*
# Add increment_usage RPC

## Summary
Creates a SQL function for the edge function to increment usage counts atomically.
*/

CREATE OR REPLACE FUNCTION increment_usage(p_user_id uuid, p_month text)
RETURNS void AS $$
BEGIN
  INSERT INTO usage (user_id, month, analyses_count)
  VALUES (p_user_id, p_month, 1)
  ON CONFLICT (user_id, month)
  DO UPDATE SET analyses_count = usage.analyses_count + 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;