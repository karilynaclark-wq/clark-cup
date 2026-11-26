-- ══════════════════════════════════════════════════════════════════
-- Family Cup: photos from a trip, kept as a memory
--
-- An upcoming event is a plan. Once it has happened it becomes
-- something the family did, and the photos belong with it -- so the
-- first photo added to an event creates one memory for that event and
-- every later photo attaches to the same one. Twelve photos from
-- Christmas are one memory with twelve pictures, not twelve memories.
--
-- memories.event_id ties them together, and is unique so two people
-- adding photos at once cannot end up with two memories for one trip.
--
-- Safe to re-run.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE memories
  ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES upcoming_events(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS memories_one_per_event
  ON memories (event_id) WHERE event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS memory_photos (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  memory_id  UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  family_id  UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'image' CHECK (kind IN ('image', 'video')),
  caption    TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS memory_photos_memory ON memory_photos (memory_id, created_at);

ALTER TABLE memory_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Photos in your family are viewable" ON memory_photos;
DROP POLICY IF EXISTS "Add a photo"                        ON memory_photos;
DROP POLICY IF EXISTS "Remove a photo you added"           ON memory_photos;

CREATE POLICY "Photos in your family are viewable"
  ON memory_photos FOR SELECT USING (family_id = current_family_id());

CREATE POLICY "Add a photo"
  ON memory_photos FOR INSERT WITH CHECK (
    family_id = current_family_id()
    AND created_by IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
  );

-- Your own photo only. Unlike Dad's Stuff, a wrong photo from a trip
-- is just a mistake worth undoing.
CREATE POLICY "Remove a photo you added"
  ON memory_photos FOR DELETE USING (
    family_id = current_family_id()
    AND created_by IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
  );

-- Check:
-- SELECT m.body, count(p.id) FROM memories m
--   LEFT JOIN memory_photos p ON p.memory_id = m.id
--   WHERE m.event_id IS NOT NULL GROUP BY m.body;
