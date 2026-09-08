-- ══════════════════════════════════════════════════════════════════
-- Family Cup History — past champions
--
-- The Past Champions list was a hardcoded array in the app source, so
-- every family saw the Clark family's winners. Each family now keeps
-- its own list.
--
-- Safe to re-run.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE families ADD COLUMN IF NOT EXISTS champions JSONB DEFAULT '[]'::jsonb;

UPDATE families SET champions = '[]'::jsonb WHERE champions IS NULL;

-- The Clarks' real history, moved out of the source and into their row.
UPDATE families
SET champions = '[
    {"year": "2025", "winner": "Mom",  "note": "Reigning champion 👑"},
    {"year": "2024", "winner": "Kari", "note": ""},
    {"year": "2023", "winner": "Kris", "note": ""},
    {"year": "2022", "winner": "Kyle", "note": ""}
  ]'::jsonb
WHERE name = 'The Clarks';

-- A little history for the demo family so the screen is not empty for
-- the App Review reader.
UPDATE families
SET champions = '[
    {"year": "2025", "winner": "Dad",   "note": "Reigning champion 👑"},
    {"year": "2024", "winner": "Mom",   "note": ""},
    {"year": "2023", "winner": "Jerry", "note": ""}
  ]'::jsonb
WHERE name = 'Jones Family (test)';

-- Check:
-- SELECT name, champions FROM families;
