-- ══════════════════════════════════════════════════════════════════
-- Family Cup: memories versus family knowledge
--
-- Two different things live in this table, which is why the screen is
-- called "Memories and Family Knowledge":
--
--   memory    — something that happened, worth resurfacing. These are
--               what the home panel shows and what the weekly pick
--               draws from.
--   knowledge — the family record: dates, addresses, schools, jobs,
--               who was born when and who passed when. Searchable,
--               never featured. Nobody wants "Dad passed away at
--               7:40pm" greeting them on the home screen.
--
-- Everything is searchable either way.
--
-- Safe to re-run.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE memories DROP COLUMN IF EXISTS feature;
DROP INDEX IF EXISTS memories_featurable;

ALTER TABLE memories
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'memory';

DO $$
BEGIN
  ALTER TABLE memories ADD CONSTRAINT memories_kind
    CHECK (kind IN ('memory', 'knowledge'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS memories_featurable
  ON memories (family_id) WHERE kind = 'memory';

-- Check:
-- SELECT kind, count(*) FROM memories GROUP BY 1;
