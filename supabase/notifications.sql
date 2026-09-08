-- ══════════════════════════════════════════════════════════════════
-- Family Cup: push notification schedule
--
-- Run AFTER deploying the send-push Edge Function.
-- Replace the two placeholders below before running:
--   <PROJECT_REF>   your Supabase project ref
--   <CRON_SECRET>   the same value set as the CRON_SECRET function secret
--
-- Safe to re-run: policies and jobs are dropped first.
-- ══════════════════════════════════════════════════════════════════

-- ─── Schema ──────────────────────────────────────────────────────

-- Where the app stores each member's Expo push token (app/_layout.tsx).
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS push_token TEXT;

-- Lets the points job announce each submission exactly once, and is what
-- makes batching work: everything still NULL at run time goes out together.
ALTER TABLE point_submissions
  ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS point_submissions_unnotified
  ON point_submissions (submitted_at)
  WHERE notified_at IS NULL;

-- Everything already in the table is history, not news. Without this the
-- first run would announce all 100 restored submissions in one notification.
UPDATE point_submissions
SET notified_at = NOW()
WHERE notified_at IS NULL;

-- ─── Extensions ──────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron  WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net   WITH SCHEMA extensions;

-- ─── Schedules ───────────────────────────────────────────────────
-- All times below are UTC, because pg_cron runs in UTC. The Chicago
-- wall-clock rules live in the function, which is what keeps the Sunday
-- reminder correct across daylight saving.

SELECT cron.unschedule('familycup-points')  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'familycup-points');
SELECT cron.unschedule('familycup-events')  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'familycup-events');
SELECT cron.unschedule('familycup-sunday')  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'familycup-sunday');

-- Points: every 5 minutes. Anything logged since the last run goes out as
-- a single notification, so five entries in a row is one buzz, not five.
SELECT cron.schedule('familycup-points', '*/5 * * * *', $$
  SELECT net.http_post(
    url     := 'https://<PROJECT_REF>.functions.supabase.co/send-push',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'x-cron-secret', '<CRON_SECRET>'),
    body    := jsonb_build_object('job', 'points')
  );
$$);

-- Events: once a day at 14:00 UTC (9:00 AM Chicago in summer, 8:00 in
-- winter) for anything starting tomorrow.
SELECT cron.schedule('familycup-events', '0 14 * * *', $$
  SELECT net.http_post(
    url     := 'https://<PROJECT_REF>.functions.supabase.co/send-push',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'x-cron-secret', '<CRON_SECRET>'),
    body    := jsonb_build_object('job', 'events')
  );
$$);

-- Sunday call: fires at BOTH 15:30 and 16:30 UTC every Sunday. Exactly one
-- of those is 10:30 AM in Chicago depending on daylight saving; the function
-- checks the Chicago clock and ignores the other. That is what makes the
-- reminder land at the same wall-clock time all year, for everyone, no
-- matter what time zone their phone is in.
SELECT cron.schedule('familycup-sunday', '30 15,16 * * 0', $$
  SELECT net.http_post(
    url     := 'https://<PROJECT_REF>.functions.supabase.co/send-push',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'x-cron-secret', '<CRON_SECRET>'),
    body    := jsonb_build_object('job', 'sunday')
  );
$$);

-- ─── Check ───────────────────────────────────────────────────────
-- SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE 'familycup%';
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
