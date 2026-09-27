-- ══════════════════════════════════════════════════════════════════
-- Family Cup: the weekly photo contest
--
-- Each week every member may upload one photo. Submissions close at the
-- end of Sunday, voting happens on Monday, and whoever has the most
-- hearts wins 100 points. Ties are allowed -- everyone tied wins.
--
-- A "week" is identified by the Monday it starts on, so the week of
-- Sept 28 covers Mon Sept 28 through Sun Oct 4, with voting on Oct 5.
--
-- Safe to re-run.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS photo_entries (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id  UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,                  -- the Monday the week begins
  photo_url  TEXT NOT NULL,
  caption    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One photo each per week, enforced in the database rather than trusted
  -- to the app.
  CONSTRAINT one_entry_per_week UNIQUE (family_id, week_start, profile_id)
);

-- One vote each per week. Voting again moves your heart rather than
-- adding a second one, so the app updates this row instead of inserting.
CREATE TABLE IF NOT EXISTS photo_votes (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id  UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  entry_id   UUID NOT NULL REFERENCES photo_entries(id) ON DELETE CASCADE,
  voter_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT one_vote_per_week UNIQUE (family_id, week_start, voter_id)
);

CREATE INDEX IF NOT EXISTS photo_entries_week ON photo_entries (family_id, week_start DESC);
CREATE INDEX IF NOT EXISTS photo_votes_entry  ON photo_votes (entry_id);

-- ─── Row Level Security ──────────────────────────────────────────
ALTER TABLE photo_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_votes   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Entries in your family are viewable" ON photo_entries;
DROP POLICY IF EXISTS "Add your own entry"                  ON photo_entries;
DROP POLICY IF EXISTS "Remove your own entry"               ON photo_entries;
DROP POLICY IF EXISTS "Votes in your family are viewable"   ON photo_votes;
DROP POLICY IF EXISTS "Cast your own vote"                  ON photo_votes;
DROP POLICY IF EXISTS "Move your own vote"                  ON photo_votes;
DROP POLICY IF EXISTS "Take back your own vote"             ON photo_votes;

CREATE POLICY "Entries in your family are viewable"
  ON photo_entries FOR SELECT USING (family_id = current_family_id());

CREATE POLICY "Add your own entry"
  ON photo_entries FOR INSERT WITH CHECK (
    family_id = current_family_id()
    AND profile_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Remove your own entry"
  ON photo_entries FOR DELETE USING (
    profile_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Votes in your family are viewable"
  ON photo_votes FOR SELECT USING (family_id = current_family_id());

CREATE POLICY "Cast your own vote"
  ON photo_votes FOR INSERT WITH CHECK (
    family_id = current_family_id()
    AND voter_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Move your own vote"
  ON photo_votes FOR UPDATE USING (
    voter_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Take back your own vote"
  ON photo_votes FOR DELETE USING (
    voter_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
  );

-- Check:
-- SELECT week_start, count(*) FROM photo_entries GROUP BY 1 ORDER BY 1 DESC;
