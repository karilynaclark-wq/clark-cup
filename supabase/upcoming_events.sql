-- ══════════════════════════════════════════════════════════════════
-- Clark Cup: upcoming_events
-- Run this once in the Supabase SQL Editor.
--
-- This table backs the "Upcoming" card and the Add Event modal on the
-- home tab. It existed only in the original Supabase project, created
-- by hand in the dashboard and never captured in SQL, so it was lost
-- when that project went away. Keeping it here so it is reproducible.
--
-- event_date is the start date and drives ordering. end_date is NULL
-- for single-day events and set for multi-day ones (trips). date_label
-- is the display string the app renders ("June 15", "July 4-6",
-- "Jul 30 - Aug 2"), written by the client so wording stays in the
-- app's control.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS upcoming_events (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_date DATE NOT NULL,
  end_date   DATE,
  date_label TEXT NOT NULL,
  name       TEXT NOT NULL,
  icon       TEXT NOT NULL DEFAULT '📅',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT end_after_start CHECK (end_date IS NULL OR end_date >= event_date)
);

ALTER TABLE upcoming_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Events are viewable by all authenticated users"
  ON upcoming_events FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can add events"
  ON upcoming_events FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can remove events"
  ON upcoming_events FOR DELETE
  USING (auth.role() = 'authenticated');
