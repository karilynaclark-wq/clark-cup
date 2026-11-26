-- ══════════════════════════════════════════════════════════════════
-- Family Cup: family memories
--
-- A shared, searchable record of things that happened. Anyone in the
-- family can add one by typing it, and anyone can ask questions about
-- them in plain English (the asking happens in the `memories` Edge
-- Function, which is the only place the Claude API key lives).
--
-- Three things feed it:
--   app   — somebody typed it into the Memories screen
--   sheet — imported in bulk from a spreadsheet
--   (photo contest entries are NOT copied in here; they already live
--    in photo_entries and are read from there, so a photo is never
--    stored twice and editing it in one place is enough)
--
-- happened_on is deliberately nullable: "sometime in the 90s" is still
-- worth keeping. happened_text holds whatever vague thing was said, so
-- the original wording survives even when we cannot pin a date.
--
-- Safe to re-run.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS memories (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id     UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  body          TEXT NOT NULL,
  happened_on   DATE,
  happened_text TEXT,
  people        TEXT[] NOT NULL DEFAULT '{}',
  source        TEXT NOT NULL DEFAULT 'app',
  created_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT memories_body_not_blank CHECK (length(btrim(body)) > 0),
  CONSTRAINT memories_source CHECK (source IN ('app', 'sheet'))
);

-- The two ways memories get read: newest first, and "this time last year".
CREATE INDEX IF NOT EXISTS memories_family_created ON memories (family_id, created_at DESC);
CREATE INDEX IF NOT EXISTS memories_family_happened ON memories (family_id, happened_on);

ALTER TABLE memories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Memories in your family are viewable" ON memories;
DROP POLICY IF EXISTS "Add a memory"                         ON memories;
DROP POLICY IF EXISTS "Remove a memory you added"            ON memories;

CREATE POLICY "Memories in your family are viewable"
  ON memories FOR SELECT USING (family_id = current_family_id());

CREATE POLICY "Add a memory"
  ON memories FOR INSERT WITH CHECK (
    family_id = current_family_id()
    AND created_by IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
  );

-- Unlike Dad's Stuff, a memory can be taken back -- but only by whoever
-- added it. Typing a memory into a chat box means the odd mangled entry,
-- and leaving someone stuck with it would be worse than allowing this.
CREATE POLICY "Remove a memory you added"
  ON memories FOR DELETE USING (
    family_id = current_family_id()
    AND created_by IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
  );

-- Check:
-- SELECT source, count(*) FROM memories GROUP BY 1;
