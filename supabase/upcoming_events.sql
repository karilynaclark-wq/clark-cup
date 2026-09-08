-- ══════════════════════════════════════════════════════════════════
-- Clark Cup: upcoming_events
--
-- Safe to run repeatedly. Every statement is idempotent, so a re-run
-- cannot fail partway and roll back the rest -- which is what happens
-- when a plain CREATE POLICY hits a policy that already exists, since
-- the Supabase SQL editor runs the whole script as one transaction.
--
-- This table backs the "Upcoming" card on the home tab. It existed
-- only in the original Supabase project, created by hand in the
-- dashboard and never captured in SQL, so it was lost with it.
--
--   event_date  start date; drives ordering
--   end_date    NULL for single-day events, set for trips
--   date_label  display string ("June 15", "July 4-6", "Jul 30 - Aug 2")
--   profile_id  who the event is for; NULL means the whole family
--   created_by  who added it; only they can delete it
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS upcoming_events (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_date DATE NOT NULL,
  end_date   DATE,
  date_label TEXT NOT NULL,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  name       TEXT NOT NULL,
  icon       TEXT NOT NULL DEFAULT '📅',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Columns, for a table created by an earlier version of this script
ALTER TABLE upcoming_events ADD COLUMN IF NOT EXISTS end_date   DATE;
ALTER TABLE upcoming_events ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE upcoming_events ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- An end date that precedes the start is nonsense; enforce it here too
ALTER TABLE upcoming_events DROP CONSTRAINT IF EXISTS end_after_start;
ALTER TABLE upcoming_events ADD  CONSTRAINT end_after_start
  CHECK (end_date IS NULL OR end_date >= event_date);

ALTER TABLE upcoming_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Events are viewable by all authenticated users" ON upcoming_events;
CREATE POLICY "Events are viewable by all authenticated users"
  ON upcoming_events FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can add events" ON upcoming_events;
CREATE POLICY "Authenticated users can add events"
  ON upcoming_events FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Replaces an earlier policy that let anyone delete anyone's event
DROP POLICY IF EXISTS "Authenticated users can remove events" ON upcoming_events;
DROP POLICY IF EXISTS "Users can delete events they created" ON upcoming_events;
CREATE POLICY "Users can delete events they created"
  ON upcoming_events FOR DELETE
  USING (created_by IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid()));
