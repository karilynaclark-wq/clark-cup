-- ══════════════════════════════════════════════════════════════════
-- Family Cup: split the address into street, city, state and ZIP
--
-- It was one free-text line, so people typed whatever shape they liked.
--
-- address stays as the composed single line, kept in sync by the app, so
-- anything that wants a whole address still has one.
--
-- Safe to re-run.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS street TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS city   TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS state  TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS zip    TEXT;

-- Existing single-line addresses go into street untouched rather than
-- being guessed apart; the owner can tidy them on their Profile screen.
UPDATE profiles
SET street = address
WHERE street IS NULL AND address IS NOT NULL AND trim(address) <> '';

-- Check:
-- SELECT username, street, city, state, zip, address FROM profiles;
