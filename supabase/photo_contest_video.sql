-- ══════════════════════════════════════════════════════════════════
-- Family Cup: videos in the weekly photo contest
--
-- An entry is now either a photo or a short video. Everything else
-- about the contest is unchanged: still one entry per person per week,
-- still one heart per person, still 100 points to whoever wins.
--
-- Existing rows are all photos, so 'image' is the default and the
-- column is filled in for every entry already there.
--
-- Safe to re-run.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE photo_entries
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'image';

DO $$
BEGIN
  ALTER TABLE photo_entries
    ADD CONSTRAINT photo_entries_kind CHECK (kind IN ('image', 'video'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Check: every entry should have a kind, and only these two.
-- SELECT kind, count(*) FROM photo_entries GROUP BY 1;
