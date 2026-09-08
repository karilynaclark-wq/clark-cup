-- Clark Cup Database Schema
-- Run this in your Supabase project's SQL Editor

-- ─── Profiles ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  username    TEXT NOT NULL,
  avatar_url  TEXT,
  address     TEXT,
  phone       TEXT,
  total_points INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by all authenticated users"
  ON profiles FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);


-- ─── Point Submissions ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS point_submissions (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  category     TEXT NOT NULL CHECK (category IN ('sunday_call', 'weekly_photo', 'miscellaneous')),
  custom_name  TEXT,    -- used when category = 'miscellaneous'
  points       INTEGER NOT NULL CHECK (points > 0),
  photo_url    TEXT,
  notes        TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE point_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Submissions are viewable by all authenticated users"
  ON point_submissions FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert their own submissions"
  ON point_submissions FOR INSERT
  WITH CHECK (auth.uid() = user_id);


-- ─── Auto-update total_points ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_total_points()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE profiles
  SET
    total_points = (
      SELECT COALESCE(SUM(points), 0)
      FROM point_submissions
      WHERE user_id = NEW.user_id
    ),
    updated_at = NOW()
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_submission_insert ON point_submissions;
CREATE TRIGGER on_submission_insert
  AFTER INSERT ON point_submissions
  FOR EACH ROW EXECUTE FUNCTION update_total_points();


-- ─── Auto-create profile on sign up ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ─── Storage bucket for photos ────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('photos', 'photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Photos are publicly viewable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'photos');

CREATE POLICY "Authenticated users can upload photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'photos' AND auth.role() = 'authenticated');

CREATE POLICY "Users can update their own photos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'photos' AND auth.role() = 'authenticated');
