-- ══════════════════════════════════════════════════════════════════
-- Family Cup: keep the tender things out of the weekly rotation
--
-- The family history includes deaths, diagnoses, a hospice admission,
-- a separation, court dates and money. All of it belongs in the record
-- and all of it should be findable. None of it should surprise five
-- people on the home screen as "This Week's Memory".
--
-- So: everything is searchable, but only `feature = true` rows are
-- eligible for the weekly pick and the home panel.
--
-- Safe to re-run.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE memories
  ADD COLUMN IF NOT EXISTS feature BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS memories_featurable
  ON memories (family_id) WHERE feature;

-- Check:
-- SELECT feature, count(*) FROM memories GROUP BY 1;
