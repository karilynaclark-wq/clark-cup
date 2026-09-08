-- ══════════════════════════════════════════════════════════════════
-- Family Cup: family groups
--
-- Until now every signed-in user could read every other user's data --
-- RLS granted access to anyone with auth.role() = 'authenticated', with
-- no notion of which family they belonged to. That made the app unusable
-- publicly (a stranger would see the Clark family's points) and left it
-- open to App Store guideline 4.2, since a private single-family app has
-- no purpose for anyone else.
--
-- This scopes every table to a family. Anyone can create their own family
-- and invite people with its join code.
--
-- Safe to re-run.
-- ══════════════════════════════════════════════════════════════════

-- ─── Families ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS families (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT NOT NULL,
  join_code  TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Six characters, no O/0/I/1 so codes can be read aloud without confusion.
CREATE OR REPLACE FUNCTION generate_join_code()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  alphabet TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code     TEXT;
  i        INT;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..6 LOOP
      code := code || substr(alphabet, floor(random() * length(alphabet) + 1)::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM families WHERE join_code = code);
  END LOOP;
  RETURN code;
END;
$$;

-- generate_join_code() has to exist before it can be a default, which is
-- why this is not on the CREATE TABLE above.
ALTER TABLE families ALTER COLUMN join_code SET DEFAULT generate_join_code();

-- ─── Scope every table to a family ───────────────────────────────
ALTER TABLE profiles           ADD COLUMN IF NOT EXISTS family_id UUID REFERENCES families(id) ON DELETE CASCADE;
ALTER TABLE point_submissions  ADD COLUMN IF NOT EXISTS family_id UUID REFERENCES families(id) ON DELETE CASCADE;
ALTER TABLE upcoming_events    ADD COLUMN IF NOT EXISTS family_id UUID REFERENCES families(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS profiles_family    ON profiles (family_id);
CREATE INDEX IF NOT EXISTS submissions_family ON point_submissions (family_id);
CREATE INDEX IF NOT EXISTS events_family      ON upcoming_events (family_id);

-- ─── Move existing data into the Clark family ────────────────────
-- Everyone already in the table belongs together; without this they would
-- all be orphaned and unable to see anything.
DO $$
DECLARE clark UUID;
BEGIN
  SELECT id INTO clark FROM families WHERE name = 'The Clarks';
  IF clark IS NULL THEN
    INSERT INTO families (name, join_code) VALUES ('The Clarks', generate_join_code())
    RETURNING id INTO clark;
  END IF;

  UPDATE profiles          SET family_id = clark WHERE family_id IS NULL;
  UPDATE point_submissions SET family_id = clark WHERE family_id IS NULL;
  UPDATE upcoming_events   SET family_id = clark WHERE family_id IS NULL;
END $$;

-- ─── Allow the newer Quick Add categories ────────────────────────
-- my-points.tsx submits 'board_game' and 'recipe', but the original CHECK
-- constraint only permitted three categories, so both of those Quick Add
-- buttons failed with a constraint violation.
ALTER TABLE point_submissions DROP CONSTRAINT IF EXISTS point_submissions_category_check;
ALTER TABLE point_submissions ADD  CONSTRAINT point_submissions_category_check
  CHECK (category IN ('sunday_call', 'weekly_photo', 'board_game', 'recipe', 'miscellaneous'));

-- ─── Which family is the caller in? ──────────────────────────────
-- SECURITY DEFINER so the lookup itself is not filtered by the very
-- policies that call it, which would recurse.
CREATE OR REPLACE FUNCTION current_family_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT family_id FROM profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

-- ─── Replace the wide-open policies ──────────────────────────────
ALTER TABLE families ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles are viewable by all authenticated users"    ON profiles;
DROP POLICY IF EXISTS "Submissions are viewable by all authenticated users" ON point_submissions;
DROP POLICY IF EXISTS "Users can insert their own submissions"              ON point_submissions;
DROP POLICY IF EXISTS "Events are viewable by all authenticated users"      ON upcoming_events;
DROP POLICY IF EXISTS "Authenticated users can add events"                  ON upcoming_events;
DROP POLICY IF EXISTS "Authenticated users can remove events"               ON upcoming_events;
DROP POLICY IF EXISTS "Users can delete their own events"                   ON upcoming_events;
DROP POLICY IF EXISTS "Your family is viewable"                             ON families;
DROP POLICY IF EXISTS "Anyone can create a family"                          ON families;
DROP POLICY IF EXISTS "Profiles in your family are viewable"                ON profiles;
DROP POLICY IF EXISTS "Submissions in your family are viewable"             ON point_submissions;
DROP POLICY IF EXISTS "Add submissions to your family"                      ON point_submissions;
DROP POLICY IF EXISTS "Events in your family are viewable"                  ON upcoming_events;
DROP POLICY IF EXISTS "Add events to your family"                           ON upcoming_events;
DROP POLICY IF EXISTS "Delete events you created"                           ON upcoming_events;

CREATE POLICY "Your family is viewable"
  ON families FOR SELECT USING (id = current_family_id());

-- Signup needs to create a family before the user has one, so this is
-- open. A family row on its own exposes nothing until someone joins it.
CREATE POLICY "Anyone can create a family"
  ON families FOR INSERT WITH CHECK (true);

CREATE POLICY "Profiles in your family are viewable"
  ON profiles FOR SELECT USING (family_id = current_family_id());

CREATE POLICY "Submissions in your family are viewable"
  ON point_submissions FOR SELECT USING (family_id = current_family_id());

CREATE POLICY "Add submissions to your family"
  ON point_submissions FOR INSERT WITH CHECK (
    family_id = current_family_id()
    AND user_id IN (SELECT id FROM profiles WHERE family_id = current_family_id())
  );

CREATE POLICY "Events in your family are viewable"
  ON upcoming_events FOR SELECT USING (family_id = current_family_id());

CREATE POLICY "Add events to your family"
  ON upcoming_events FOR INSERT WITH CHECK (family_id = current_family_id());

CREATE POLICY "Delete events you created"
  ON upcoming_events FOR DELETE USING (
    created_by IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
  );

-- ─── Joining a family ────────────────────────────────────────────
-- Signup needs to turn a join code into a family id, but a user cannot
-- read the families table until they are already in one. This resolves a
-- code without exposing the table, and reveals nothing beyond whether the
-- code is real.
CREATE OR REPLACE FUNCTION family_id_for_code(code TEXT)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM families WHERE join_code = upper(trim(code)) LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION create_family(family_name TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE new_id UUID;
BEGIN
  INSERT INTO families (name, join_code)
  VALUES (trim(family_name), generate_join_code())
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_family(TEXT)      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION family_id_for_code(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION current_family_id()      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION generate_join_code()     TO anon, authenticated;

-- ─── Your family's code, to share ────────────────────────────────
-- SELECT name, join_code FROM families;
