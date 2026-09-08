-- ══════════════════════════════════════════════════════════════════
-- Customizable Quick Add cards
--
-- The four Quick Add shortcuts were hardcoded to the Clark family's own
-- activities, which reads as unfinished in an app any family can use.
-- Each family now stores its own four labels and point values.
--
-- Four cards, always: the slots keep their behaviour (multi-select for
-- one, pick-a-winner-with-a-photo for another), so only the wording and
-- the points are editable.
--
-- Safe to re-run.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE families ADD COLUMN IF NOT EXISTS quick_adds JSONB
  DEFAULT '[
    {"label": "Sunday Call",   "points": 50},
    {"label": "Photo Contest", "points": 100},
    {"label": "Game Night",    "points": 10},
    {"label": "Recipe Share",  "points": 30}
  ]'::jsonb;

-- Families created before this column existed have no defaults yet.
UPDATE families
SET quick_adds = '[
    {"label": "Sunday Call",   "points": 50},
    {"label": "Photo Contest", "points": 100},
    {"label": "Game Night",    "points": 10},
    {"label": "Recipe Share",  "points": 30}
  ]'::jsonb
WHERE quick_adds IS NULL;

-- Members need to be able to save their edits. Scoped to their own
-- family, so nobody can rename another family's cards.
DROP POLICY IF EXISTS "Members can update their family" ON families;
CREATE POLICY "Members can update their family"
  ON families FOR UPDATE
  USING (id = current_family_id())
  WITH CHECK (id = current_family_id());

-- Check:
-- SELECT name, quick_adds FROM families;
