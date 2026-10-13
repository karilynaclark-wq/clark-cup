-- ══════════════════════════════════════════════════════════════════
-- Family Cup: the notifications that have no other home
--
-- Most of the Activity Center is built from tables that already exist:
-- points, events, photo entries, point requests. The scheduled reminders
-- are different -- nothing is written when cron fires, so there is
-- nothing for the feed to read. This table is where the push function
-- records what it told the family, in the same words it used.
--
-- Written only by the edge function, which runs as the service role and
-- bypasses RLS, so there is no insert policy here on purpose.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS activity_events (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id  UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  -- The photo reminders fire at 5pm in each person's own zone, so one
  -- logical reminder can span several hourly runs. This key makes the
  -- write idempotent: one row per family per reminder, however many
  -- runs it takes to reach everyone.
  dedupe_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT one_per_family_per_key UNIQUE (family_id, kind, dedupe_key)
);

CREATE INDEX IF NOT EXISTS activity_events_recent
  ON activity_events (family_id, created_at DESC);

ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Activity in your family is viewable" ON activity_events;
CREATE POLICY "Activity in your family is viewable"
  ON activity_events FOR SELECT USING (family_id = current_family_id());

-- Check:
-- SELECT kind, title, body, created_at FROM activity_events ORDER BY created_at DESC LIMIT 10;
