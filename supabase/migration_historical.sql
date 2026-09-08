-- ══════════════════════════════════════════════════════════════════
-- Clark Cup: Historical Data Migration
-- Run this ONCE in Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════════

-- Step 1: Back up existing data
CREATE TEMP TABLE profiles_backup AS SELECT * FROM profiles;
CREATE TEMP TABLE submissions_backup AS SELECT * FROM point_submissions;

-- Step 2: Drop and recreate tables with new structure
-- (profiles.id is now its own UUID, not tied to auth.users)
DROP TABLE point_submissions CASCADE;
DROP TABLE profiles CASCADE;

CREATE TABLE profiles (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  username     TEXT NOT NULL,
  email        TEXT,
  avatar_url   TEXT,
  address      TEXT,
  phone        TEXT,
  total_points INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE point_submissions (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  category     TEXT NOT NULL CHECK (category IN ('sunday_call', 'weekly_photo', 'miscellaneous')),
  custom_name  TEXT,
  points       INTEGER NOT NULL CHECK (points > 0),
  photo_url    TEXT,
  notes        TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Step 3: Re-enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by all authenticated users"
  ON profiles FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Anyone can insert a profile"
  ON profiles FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE USING (auth_user_id = auth.uid());

CREATE POLICY "Submissions are viewable by all authenticated users"
  ON point_submissions FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert their own submissions"
  ON point_submissions FOR INSERT WITH CHECK (
    user_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
  );

-- Step 4: Recreate total_points trigger
CREATE OR REPLACE FUNCTION update_total_points()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE profiles
  SET total_points = (
    SELECT COALESCE(SUM(points), 0)
    FROM point_submissions
    WHERE user_id = NEW.user_id
  ), updated_at = NOW()
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_submission_insert
  AFTER INSERT ON point_submissions
  FOR EACH ROW EXECUTE FUNCTION update_total_points();

-- Step 5: Restore existing authenticated profiles
-- Maps old id → auth_user_id so existing logins still work
INSERT INTO profiles (auth_user_id, username, email, avatar_url, address, phone, created_at, updated_at)
SELECT id, username, email, avatar_url, address, phone, created_at, updated_at
FROM profiles_backup;

-- Step 6: Create placeholder profiles for family members who haven't signed up yet
-- (Skips if a profile with that username already exists from the backup above)
INSERT INTO profiles (username)
SELECT 'Kyle' WHERE NOT EXISTS (SELECT 1 FROM profiles WHERE username = 'Kyle');

INSERT INTO profiles (username)
SELECT 'Kari' WHERE NOT EXISTS (SELECT 1 FROM profiles WHERE username = 'Kari');

INSERT INTO profiles (username)
SELECT 'Mom' WHERE NOT EXISTS (SELECT 1 FROM profiles WHERE username = 'Mom');

INSERT INTO profiles (username)
SELECT 'Kris' WHERE NOT EXISTS (SELECT 1 FROM profiles WHERE username = 'Kris');

INSERT INTO profiles (username)
SELECT 'Kelly' WHERE NOT EXISTS (SELECT 1 FROM profiles WHERE username = 'Kelly');

-- Step 7: Import all 2026 historical point submissions
-- Houses: slytherin=Kyle, hufflepuff=Kari, professor=Mom, gryffindor=Kris, ravenclaw=Kelly
-- Categories: sunday_call (family calls), weekly_photo (photo contests), miscellaneous (everything else)

INSERT INTO point_submissions (user_id, category, custom_name, points, submitted_at) VALUES

-- January 1 — Game night
((SELECT id FROM profiles WHERE username = 'Kyle'  LIMIT 1), 'miscellaneous', 'Sequence', 10, '2026-01-01 03:41:33+00'),
((SELECT id FROM profiles WHERE username = 'Kari'  LIMIT 1), 'miscellaneous', 'Sequence', 10, '2026-01-01 03:42:05+00'),
((SELECT id FROM profiles WHERE username = 'Kyle'  LIMIT 1), 'miscellaneous', 'Sequence', 10, '2026-01-01 04:01:17+00'),
((SELECT id FROM profiles WHERE username = 'Kari'  LIMIT 1), 'miscellaneous', 'Sequence', 10, '2026-01-01 04:01:31+00'),
((SELECT id FROM profiles WHERE username = 'Kari'  LIMIT 1), 'miscellaneous', 'Sequence', 10, '2026-01-01 04:28:54+00'),
((SELECT id FROM profiles WHERE username = 'Mom'   LIMIT 1), 'miscellaneous', 'Sequence', 10, '2026-01-01 04:29:05+00'),
((SELECT id FROM profiles WHERE username = 'Kris'  LIMIT 1), 'miscellaneous', 'Taco cat GOAT', 10, '2026-01-01 05:22:35+00'),
((SELECT id FROM profiles WHERE username = 'Kelly' LIMIT 1), 'miscellaneous', 'Spoons', 10, '2026-01-01 05:34:45+00'),
((SELECT id FROM profiles WHERE username = 'Kelly' LIMIT 1), 'miscellaneous', 'Spoons', 10, '2026-01-01 05:46:47+00'),
((SELECT id FROM profiles WHERE username = 'Kris'  LIMIT 1), 'miscellaneous', 'Spoons', 10, '2026-01-01 06:05:26+00'),
((SELECT id FROM profiles WHERE username = 'Kelly' LIMIT 1), 'miscellaneous', 'Spoons', 10, '2026-01-01 06:17:56+00'),

-- January 2
((SELECT id FROM profiles WHERE username = 'Kari'  LIMIT 1), 'miscellaneous', 'Rescuing the dog on blacks beach and returning a 5lb yorkie to its owner!', 35, '2026-01-02 20:16:01+00'),

-- January 5
((SELECT id FROM profiles WHERE username = 'Kris'  LIMIT 1), 'weekly_photo', 'Photo contest', 50, '2026-01-05 04:46:43+00'),

-- January 12
((SELECT id FROM profiles WHERE username = 'Kari'  LIMIT 1), 'weekly_photo', 'Photo contest IU', 50, '2026-01-12 09:16:06+00'),
((SELECT id FROM profiles WHERE username = 'Kelly' LIMIT 1), 'sunday_call', NULL, 50, '2026-01-12 09:16:43+00'),
((SELECT id FROM profiles WHERE username = 'Mom'   LIMIT 1), 'sunday_call', NULL, 50, '2026-01-12 09:16:52+00'),
((SELECT id FROM profiles WHERE username = 'Kari'  LIMIT 1), 'sunday_call', NULL, 50, '2026-01-12 09:17:01+00'),

-- January 19
((SELECT id FROM profiles WHERE username = 'Kris'  LIMIT 1), 'weekly_photo', 'For outrageous adventures in Costa Rica photo contest', 50, '2026-01-19 06:52:51+00'),
((SELECT id FROM profiles WHERE username = 'Kris'  LIMIT 1), 'sunday_call', NULL, 50, '2026-01-19 06:53:08+00'),
((SELECT id FROM profiles WHERE username = 'Kyle'  LIMIT 1), 'sunday_call', NULL, 50, '2026-01-19 06:53:18+00'),
((SELECT id FROM profiles WHERE username = 'Kari'  LIMIT 1), 'sunday_call', NULL, 50, '2026-01-19 06:53:28+00'),
((SELECT id FROM profiles WHERE username = 'Kelly' LIMIT 1), 'sunday_call', NULL, 50, '2026-01-19 06:53:39+00'),
((SELECT id FROM profiles WHERE username = 'Mom'   LIMIT 1), 'sunday_call', NULL, 50, '2026-01-19 06:53:52+00'),

-- January 26
((SELECT id FROM profiles WHERE username = 'Kris'  LIMIT 1), 'sunday_call', NULL, 50, '2026-01-26 14:30:31+00'),
((SELECT id FROM profiles WHERE username = 'Kyle'  LIMIT 1), 'sunday_call', NULL, 50, '2026-01-26 14:30:40+00'),
((SELECT id FROM profiles WHERE username = 'Kari'  LIMIT 1), 'sunday_call', NULL, 50, '2026-01-26 14:30:50+00'),
((SELECT id FROM profiles WHERE username = 'Kelly' LIMIT 1), 'sunday_call', NULL, 50, '2026-01-26 14:30:59+00'),
((SELECT id FROM profiles WHERE username = 'Mom'   LIMIT 1), 'sunday_call', NULL, 50, '2026-01-26 14:31:09+00'),
((SELECT id FROM profiles WHERE username = 'Kelly' LIMIT 1), 'miscellaneous', 'Officially filing the paperwork 🙌', 82, '2026-01-26 14:31:27+00'),

-- January 27
((SELECT id FROM profiles WHERE username = 'Kari'  LIMIT 1), 'weekly_photo', 'Photo context boxing', 50, '2026-01-27 12:25:15+00'),

-- February 3
((SELECT id FROM profiles WHERE username = 'Kari'  LIMIT 1), 'sunday_call', NULL, 50, '2026-02-03 17:10:11+00'),
((SELECT id FROM profiles WHERE username = 'Mom'   LIMIT 1), 'sunday_call', NULL, 50, '2026-02-03 17:10:24+00'),
((SELECT id FROM profiles WHERE username = 'Kelly' LIMIT 1), 'sunday_call', NULL, 50, '2026-02-03 17:10:36+00'),

-- February 9
((SELECT id FROM profiles WHERE username = 'Kyle'  LIMIT 1), 'sunday_call', NULL, 50, '2026-02-09 14:22:20+00'),
((SELECT id FROM profiles WHERE username = 'Kris'  LIMIT 1), 'sunday_call', NULL, 50, '2026-02-09 14:22:42+00'),
((SELECT id FROM profiles WHERE username = 'Kari'  LIMIT 1), 'sunday_call', NULL, 50, '2026-02-09 14:22:53+00'),
((SELECT id FROM profiles WHERE username = 'Kelly' LIMIT 1), 'sunday_call', NULL, 50, '2026-02-09 14:23:03+00'),
((SELECT id FROM profiles WHERE username = 'Mom'   LIMIT 1), 'sunday_call', NULL, 50, '2026-02-09 14:23:13+00'),

-- February 15
((SELECT id FROM profiles WHERE username = 'Kyle'  LIMIT 1), 'miscellaneous', 'Outstanding courage in the face of birthday parties', 29, '2026-02-15 15:21:29+00'),
((SELECT id FROM profiles WHERE username = 'Kris'  LIMIT 1), 'miscellaneous', 'Loyalty to the gang', 50, '2026-02-15 22:06:15+00'),
((SELECT id FROM profiles WHERE username = 'Kyle'  LIMIT 1), 'miscellaneous', 'Loyalty to the gang', 50, '2026-02-15 22:06:25+00'),
((SELECT id FROM profiles WHERE username = 'Kari'  LIMIT 1), 'miscellaneous', 'Loyalty to the gang', 50, '2026-02-15 22:07:14+00'),
((SELECT id FROM profiles WHERE username = 'Kelly' LIMIT 1), 'miscellaneous', 'Loyalty to the gang', 50, '2026-02-15 22:07:23+00'),
((SELECT id FROM profiles WHERE username = 'Mom'   LIMIT 1), 'miscellaneous', 'Loyalty to the gang', 50, '2026-02-15 22:07:30+00'),

-- February 16
((SELECT id FROM profiles WHERE username = 'Kris'  LIMIT 1), 'weekly_photo', 'Doing dope stuff (photo contest)', 50, '2026-02-16 09:24:56+00'),

-- February 17
((SELECT id FROM profiles WHERE username = 'Kris'  LIMIT 1), 'miscellaneous', 'Eyes on fire by blue foundation', 12, '2026-02-17 18:57:00+00'),

-- February 18
((SELECT id FROM profiles WHERE username = 'Kyle'  LIMIT 1), 'miscellaneous', 'Awesome cooking skills', 27, '2026-02-18 16:33:18+00'),

-- February 20
((SELECT id FROM profiles WHERE username = 'Kelly' LIMIT 1), 'miscellaneous', 'Saving slytherin with ID', 12, '2026-02-20 13:20:33+00'),
((SELECT id FROM profiles WHERE username = 'Kris'  LIMIT 1), 'miscellaneous', 'Smashing that adult shit #pool table', 132, '2026-02-20 22:39:21+00'),

-- February 21
((SELECT id FROM profiles WHERE username = 'Kelly' LIMIT 1), 'miscellaneous', 'Guessing the password', 10, '2026-02-21 00:37:23+00'),

-- February 23
((SELECT id FROM profiles WHERE username = 'Kris'  LIMIT 1), 'miscellaneous', 'Loyalty to the cause', 50, '2026-02-23 11:35:11+00'),
((SELECT id FROM profiles WHERE username = 'Kari'  LIMIT 1), 'miscellaneous', 'Loyalty to the cause', 50, '2026-02-23 11:35:47+00'),
((SELECT id FROM profiles WHERE username = 'Kelly' LIMIT 1), 'miscellaneous', 'Loyalty to the cause', 50, '2026-02-23 11:36:00+00'),
((SELECT id FROM profiles WHERE username = 'Mom'   LIMIT 1), 'miscellaneous', 'Loyalty to the cause', 50, '2026-02-23 11:36:08+00'),
((SELECT id FROM profiles WHERE username = 'Kari'  LIMIT 1), 'weekly_photo', 'Photo Contest', 50, '2026-02-23 16:41:29+00'),

-- March 2
((SELECT id FROM profiles WHERE username = 'Kelly' LIMIT 1), 'miscellaneous', 'Outrageous helicopter stuff', 50, '2026-03-02 09:55:21+00'),
((SELECT id FROM profiles WHERE username = 'Kris'  LIMIT 1), 'miscellaneous', 'Loyalty to the gang', 50, '2026-03-02 09:56:22+00'),
((SELECT id FROM profiles WHERE username = 'Kari'  LIMIT 1), 'miscellaneous', 'Loyalty to the gang', 50, '2026-03-02 09:56:31+00'),
((SELECT id FROM profiles WHERE username = 'Kelly' LIMIT 1), 'miscellaneous', 'Loyalty to the gang', 50, '2026-03-02 09:56:39+00'),
((SELECT id FROM profiles WHERE username = 'Mom'   LIMIT 1), 'miscellaneous', 'Loyalty to the gang', 50, '2026-03-02 09:56:47+00'),

-- March 9
((SELECT id FROM profiles WHERE username = 'Kyle'  LIMIT 1), 'miscellaneous', 'Dope Cape Town concert photos', 50, '2026-03-09 19:55:05+00'),
((SELECT id FROM profiles WHERE username = 'Kris'  LIMIT 1), 'miscellaneous', 'Loyalty yo', 50, '2026-03-09 19:55:19+00'),
((SELECT id FROM profiles WHERE username = 'Kyle'  LIMIT 1), 'miscellaneous', 'Loyalty yo', 50, '2026-03-09 19:55:28+00'),
((SELECT id FROM profiles WHERE username = 'Kari'  LIMIT 1), 'miscellaneous', 'Loyalty yo', 50, '2026-03-09 19:55:38+00'),
((SELECT id FROM profiles WHERE username = 'Kelly' LIMIT 1), 'miscellaneous', 'Loyalty yo', 50, '2026-03-09 19:55:46+00'),
((SELECT id FROM profiles WHERE username = 'Mom'   LIMIT 1), 'miscellaneous', 'Loyalty yo', 50, '2026-03-09 19:55:53+00'),

-- March 16
((SELECT id FROM profiles WHERE username = 'Kyle'  LIMIT 1), 'miscellaneous', 'Showing up', 50, '2026-03-16 08:09:17+00'),
((SELECT id FROM profiles WHERE username = 'Mom'   LIMIT 1), 'miscellaneous', 'Showing up', 50, '2026-03-16 08:09:32+00'),
((SELECT id FROM profiles WHERE username = 'Kelly' LIMIT 1), 'miscellaneous', 'Showing up', 50, '2026-03-16 08:09:43+00'),
((SELECT id FROM profiles WHERE username = 'Kari'  LIMIT 1), 'miscellaneous', 'Showing up', 50, '2026-03-16 08:10:02+00'),
((SELECT id FROM profiles WHERE username = 'Kris'  LIMIT 1), 'miscellaneous', 'Showing up', 50, '2026-03-16 08:10:13+00'),
((SELECT id FROM profiles WHERE username = 'Kari'  LIMIT 1), 'miscellaneous', 'Duke loves a green river (not his poop)', 50, '2026-03-16 11:02:35+00'),

-- March 23
((SELECT id FROM profiles WHERE username = 'Mom'   LIMIT 1), 'miscellaneous', 'Showing up yo', 50, '2026-03-23 12:08:28+00'),

-- March 24
((SELECT id FROM profiles WHERE username = 'Kris'  LIMIT 1), 'miscellaneous', 'Italian stuff', 50, '2026-03-24 08:22:20+00'),
((SELECT id FROM profiles WHERE username = 'Mom'   LIMIT 1), 'miscellaneous', 'Dat fire cooking yooooo', 50, '2026-03-24 08:22:42+00'),

-- April 7
((SELECT id FROM profiles WHERE username = 'Kyle'  LIMIT 1), 'miscellaneous', 'Showing up for the gang', 50, '2026-04-07 08:45:56+00'),
((SELECT id FROM profiles WHERE username = 'Kari'  LIMIT 1), 'miscellaneous', 'Showing up for the gang', 50, '2026-04-07 08:46:10+00'),
((SELECT id FROM profiles WHERE username = 'Kelly' LIMIT 1), 'miscellaneous', 'Showing up for the gang', 50, '2026-04-07 08:46:17+00'),
((SELECT id FROM profiles WHERE username = 'Mom'   LIMIT 1), 'miscellaneous', 'Showing up for the gang', 50, '2026-04-07 08:46:24+00'),
((SELECT id FROM profiles WHERE username = 'Kris'  LIMIT 1), 'miscellaneous', 'And it''s messiiiiiiii (and Suarez)', 50, '2026-04-07 08:46:39+00'),
((SELECT id FROM profiles WHERE username = 'Kris'  LIMIT 1), 'miscellaneous', 'Some bomb salmon and stuff', 36, '2026-04-07 08:46:52+00'),

-- April 13
((SELECT id FROM profiles WHERE username = 'Kyle'  LIMIT 1), 'weekly_photo', 'Photo contest flowerssssss yooooo them be dope though', 50, '2026-04-13 13:53:14+00'),
((SELECT id FROM profiles WHERE username = 'Kris'  LIMIT 1), 'miscellaneous', 'loyalty and stuff', 50, '2026-04-13 13:53:25+00'),
((SELECT id FROM profiles WHERE username = 'Mom'   LIMIT 1), 'miscellaneous', 'loyalty and stuff', 50, '2026-04-13 13:53:34+00'),
((SELECT id FROM profiles WHERE username = 'Kari'  LIMIT 1), 'miscellaneous', 'loyalty and stuff', 50, '2026-04-13 13:53:39+00'),

-- April 20
((SELECT id FROM profiles WHERE username = 'Kris'  LIMIT 1), 'miscellaneous', 'loyalty', 50, '2026-04-20 08:50:08+00'),
((SELECT id FROM profiles WHERE username = 'Kari'  LIMIT 1), 'miscellaneous', 'Loyalty', 50, '2026-04-20 08:50:17+00'),
((SELECT id FROM profiles WHERE username = 'Mom'   LIMIT 1), 'miscellaneous', 'Loyalty', 50, '2026-04-20 08:50:26+00'),

-- April 27
((SELECT id FROM profiles WHERE username = 'Kris'  LIMIT 1), 'miscellaneous', 'showing up', 50, '2026-04-27 09:10:06+00'),
((SELECT id FROM profiles WHERE username = 'Kyle'  LIMIT 1), 'miscellaneous', 'showing up', 50, '2026-04-27 09:10:11+00'),
((SELECT id FROM profiles WHERE username = 'Kari'  LIMIT 1), 'miscellaneous', 'showing up', 50, '2026-04-27 09:10:17+00'),
((SELECT id FROM profiles WHERE username = 'Kelly' LIMIT 1), 'miscellaneous', 'showing up', 50, '2026-04-27 09:10:22+00'),
((SELECT id FROM profiles WHERE username = 'Mom'   LIMIT 1), 'miscellaneous', 'showing up', 50, '2026-04-27 09:10:26+00'),
((SELECT id FROM profiles WHERE username = 'Kyle'  LIMIT 1), 'miscellaneous', 'first ever golf lol cant believe yall allowed this', 27, '2026-04-27 09:10:39+00'),

-- April 29
((SELECT id FROM profiles WHERE username = 'Mom'   LIMIT 1), 'weekly_photo', 'Photo showdown with the gangggg', 50, '2026-04-29 11:24:55+00'),

-- May 4
((SELECT id FROM profiles WHERE username = 'Kyle'  LIMIT 1), 'miscellaneous', 'loyalty', 50, '2026-05-04 14:09:30+00'),
((SELECT id FROM profiles WHERE username = 'Kari'  LIMIT 1), 'miscellaneous', 'loyalty', 50, '2026-05-04 14:09:34+00'),
((SELECT id FROM profiles WHERE username = 'Kelly' LIMIT 1), 'miscellaneous', 'loyalty', 50, '2026-05-04 14:09:39+00'),
((SELECT id FROM profiles WHERE username = 'Mom'   LIMIT 1), 'miscellaneous', 'loyalty', 50, '2026-05-04 14:09:43+00'),
((SELECT id FROM profiles WHERE username = 'Kris'  LIMIT 1), 'miscellaneous', 'awesome hand written letter', 50, '2026-05-04 14:09:53+00');

-- ✅ Done! Total points are calculated automatically by the trigger.
-- When family members sign up, they'll claim their profile by matching their display name.
