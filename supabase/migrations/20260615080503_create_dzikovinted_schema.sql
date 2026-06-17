/*
# DzikoVinted — Full Schema Migration

## Summary
Creates the complete multi-user schema for the DzikoVinted SaaS platform.
Users sign in via Supabase auth, then generate AI-powered Vinted listings.

## New Tables

### profiles
Extends auth.users with app-level metadata.
- id: uuid (PK, FK → auth.users.id)
- email: text
- full_name: text (optional display name)
- plan: text (free | pro | team), defaults to 'free'
- avatar_url: text (optional)
- created_at: timestamptz

### listings
Stores every generated AI listing per user.
- id: uuid (PK)
- user_id: uuid (FK → auth.users.id, DEFAULT auth.uid())
- title: text (SEO-optimised title)
- description: text (SEO description)
- brand: text
- category: text
- color: text
- size: text
- material: text
- condition: text
- price: numeric (recommended price)
- quick_price: numeric (quick sale price)
- premium_price: numeric (premium price)
- keywords: text[] (SEO keywords)
- vinted_filters: jsonb (structured Vinted filter pairs)
- image_urls: text[] (uploaded photo URLs if stored)
- is_favorite: boolean (user bookmarked this)
- created_at: timestamptz

### usage
Tracks per-user monthly analysis consumption for plan limits.
- id: uuid (PK)
- user_id: uuid (FK → auth.users.id, DEFAULT auth.uid())
- month: text (format YYYY-MM, e.g. '2026-06')
- analyses_count: integer (count of analyses performed this month)
- UNIQUE(user_id, month) ensures one row per user per month

## Security
All three tables have RLS enabled with owner-scoped authenticated policies.
*/

-- ─── PROFILES ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text NOT NULL,
  full_name   text,
  plan        text NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro','team')),
  avatar_url  text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile"  ON profiles;
DROP POLICY IF EXISTS "insert_own_profile"  ON profiles;
DROP POLICY IF EXISTS "update_own_profile"  ON profiles;
DROP POLICY IF EXISTS "delete_own_profile"  ON profiles;

CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "delete_own_profile" ON profiles FOR DELETE
  TO authenticated USING (auth.uid() = id);

-- ─── LISTINGS ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS listings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title          text NOT NULL,
  description    text,
  brand          text,
  category       text,
  color          text,
  size           text,
  material       text,
  condition      text,
  price          numeric(10,2),
  quick_price    numeric(10,2),
  premium_price  numeric(10,2),
  keywords       text[],
  vinted_filters jsonb DEFAULT '[]'::jsonb,
  image_urls     text[] DEFAULT '{}',
  is_favorite    boolean DEFAULT false,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS listings_user_id_idx    ON listings(user_id);
CREATE INDEX IF NOT EXISTS listings_created_at_idx ON listings(created_at DESC);
CREATE INDEX IF NOT EXISTS listings_brand_idx      ON listings(brand);

ALTER TABLE listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_listings" ON listings;
DROP POLICY IF EXISTS "insert_own_listings" ON listings;
DROP POLICY IF EXISTS "update_own_listings" ON listings;
DROP POLICY IF EXISTS "delete_own_listings" ON listings;

CREATE POLICY "select_own_listings" ON listings FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "insert_own_listings" ON listings FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update_own_listings" ON listings FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "delete_own_listings" ON listings FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ─── USAGE ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS usage (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  month           text NOT NULL,
  analyses_count  integer NOT NULL DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  UNIQUE(user_id, month)
);

CREATE INDEX IF NOT EXISTS usage_user_month_idx ON usage(user_id, month);

ALTER TABLE usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_usage" ON usage;
DROP POLICY IF EXISTS "insert_own_usage" ON usage;
DROP POLICY IF EXISTS "update_own_usage" ON usage;
DROP POLICY IF EXISTS "delete_own_usage" ON usage;

CREATE POLICY "select_own_usage" ON usage FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "insert_own_usage" ON usage FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update_own_usage" ON usage FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "delete_own_usage" ON usage FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ─── AUTO-CREATE PROFILE ON SIGNUP ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
