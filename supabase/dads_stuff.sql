-- ══════════════════════════════════════════════════════════════════
-- Family Cup: Dad's Stuff
--
-- A temporary room in the app for going through Dad's things. Photos
-- and videos go up, and each person says one of three things about
-- each item:
--
--   claim  — I would like this
--   save   — keep it, at Mom's house
--   pass   — I do not want it
--
-- Everyone sees everyone's answer: the whole point is working out who
-- wants what without five separate text threads.
--
-- Temporary by design. `families.dads_stuff` switches the section on
-- and off, and dropping these two tables removes it entirely.
--
-- Safe to re-run.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE families ADD COLUMN IF NOT EXISTS dads_stuff BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS dads_stuff_items (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id  UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  media_url  TEXT NOT NULL,
  -- 'image' or 'video'. Video has no inline player in this build, so
  -- the app opens it in a browser sheet instead.
  kind       TEXT NOT NULL DEFAULT 'image' CHECK (kind IN ('image', 'video')),
  caption    TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dads_stuff_votes (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id    UUID NOT NULL REFERENCES dads_stuff_items(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  choice     TEXT NOT NULL CHECK (choice IN ('claim', 'save', 'pass')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One answer each. Changing your mind updates this row.
  CONSTRAINT one_choice_per_item UNIQUE (item_id, profile_id)
);

CREATE INDEX IF NOT EXISTS dads_stuff_items_family
  ON dads_stuff_items (family_id, created_at DESC);
CREATE INDEX IF NOT EXISTS dads_stuff_votes_item ON dads_stuff_votes (item_id);

-- ─── Row Level Security ──────────────────────────────────────────
ALTER TABLE dads_stuff_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE dads_stuff_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Items in your family are viewable" ON dads_stuff_items;
DROP POLICY IF EXISTS "Add an item"                       ON dads_stuff_items;
DROP POLICY IF EXISTS "Remove an item you added"          ON dads_stuff_items;
DROP POLICY IF EXISTS "Votes in your family are viewable" ON dads_stuff_votes;
DROP POLICY IF EXISTS "Say what you want"                 ON dads_stuff_votes;
DROP POLICY IF EXISTS "Change your mind"                  ON dads_stuff_votes;
DROP POLICY IF EXISTS "Take back your answer"             ON dads_stuff_votes;

CREATE POLICY "Items in your family are viewable"
  ON dads_stuff_items FOR SELECT USING (family_id = current_family_id());

CREATE POLICY "Add an item"
  ON dads_stuff_items FOR INSERT WITH CHECK (
    family_id = current_family_id()
    AND created_by IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Remove an item you added"
  ON dads_stuff_items FOR DELETE USING (
    created_by IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Votes in your family are viewable"
  ON dads_stuff_votes FOR SELECT USING (
    item_id IN (SELECT id FROM dads_stuff_items WHERE family_id = current_family_id())
  );

CREATE POLICY "Say what you want"
  ON dads_stuff_votes FOR INSERT WITH CHECK (
    profile_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
    AND item_id IN (SELECT id FROM dads_stuff_items WHERE family_id = current_family_id())
  );

CREATE POLICY "Change your mind"
  ON dads_stuff_votes FOR UPDATE USING (
    profile_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Take back your answer"
  ON dads_stuff_votes FOR DELETE USING (
    profile_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
  );

-- On for the Clarks only.
UPDATE families SET dads_stuff = TRUE WHERE name = 'The Clarks';

-- Check:
-- SELECT i.caption, v.choice, p.username
--   FROM dads_stuff_items i
--   LEFT JOIN dads_stuff_votes v ON v.item_id = i.id
--   LEFT JOIN profiles p ON p.id = v.profile_id;
