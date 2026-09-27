-- ══════════════════════════════════════════════════════════════════
-- Family Cup: first name, last name, optional nickname
--
-- Signup used to ask for a single "display name", which meant people
-- typed anything from "Kari" to "Kari Clark". Now it asks for a first and
-- last name, and Profile offers an optional nickname.
--
-- username stays as the resolved display name shown everywhere (the
-- leaderboard, activity feed, event tags, notification copy), so nothing
-- downstream has to change. The app keeps it in sync:
--     username = nickname, or first_name when there is no nickname.
--
-- Safe to re-run.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_name  TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nickname   TEXT;

-- Split what people already typed: everything before the first space is
-- the first name, the rest is the last name. Single-word names (Mom, Kyle)
-- become a first name with no last name, which is correct for them.
UPDATE profiles
SET first_name = split_part(username, ' ', 1),
    last_name  = NULLIF(trim(substring(username FROM position(' ' IN username) + 1)), username)
WHERE first_name IS NULL;

-- Anyone whose display name was a full name now shows just their first
-- name, matching the new rule.
UPDATE profiles
SET username = COALESCE(NULLIF(trim(nickname), ''), first_name)
WHERE first_name IS NOT NULL;

-- Check:
-- SELECT username, first_name, last_name, nickname FROM profiles ORDER BY username;
