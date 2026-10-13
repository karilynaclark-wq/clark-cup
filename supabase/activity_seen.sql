-- Remembers how far down the Activity Center each person has read, so the
-- unread dot can mark only what is new to them.
--
-- Null means "never looked": the app treats that as everything already
-- seen rather than dotting the whole list on first open.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS activity_seen_at TIMESTAMPTZ;

SELECT coalesce(first_name, username) AS person, activity_seen_at
  FROM profiles ORDER BY person;
