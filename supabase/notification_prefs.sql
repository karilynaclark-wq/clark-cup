-- ══════════════════════════════════════════════════════════════════
-- Family Cup: notification preferences and per-person time zones
--
-- Adds two things:
--   notify    which kinds of notification each person wants
--   timezone  their device's time zone, so the photo contest reminders
--             can land at 5pm where they actually are
--
-- iOS can only switch an app's notifications on or off as a whole, so
-- without these toggles someone annoyed by one kind has to silence all
-- of them -- including the Sunday call reminder.
--
-- Safe to re-run. Run after supabase/notifications.sql.
-- ══════════════════════════════════════════════════════════════════

-- Defaults to everything on. A missing key is treated as on.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS notify JSONB NOT NULL
  DEFAULT '{"points": true, "events": true, "sunday": true, "photo": true}'::jsonb;

-- IANA name, e.g. 'America/Chicago'. The app writes this on sign-in.
-- NULL falls back to Chicago so a reminder still goes out.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS timezone TEXT;

-- ─── Photo contest reminders ─────────────────────────────────────
-- These fire at 5pm in each person's own time zone, so cron has to wake
-- up every hour and the function decides who it is 5pm for right now.
-- (The Sunday call reminder is the opposite: one instant for everybody.)

SELECT cron.unschedule('familycup-photo-submit') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'familycup-photo-submit');
SELECT cron.unschedule('familycup-photo-vote')   WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'familycup-photo-vote');

-- Monday 5pm local: deadline to submit a photo.
SELECT cron.schedule('familycup-photo-submit', '0 * * * *', $$
  SELECT net.http_post(
    url     := 'https://tdprtdazqneazisdpqls.functions.supabase.co/send-push',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'x-cron-secret', '<CRON_SECRET>'),
    body    := jsonb_build_object('job', 'photo_submit')
  );
$$);

-- Tuesday 5pm local: deadline to vote.
SELECT cron.schedule('familycup-photo-vote', '0 * * * *', $$
  SELECT net.http_post(
    url     := 'https://tdprtdazqneazisdpqls.functions.supabase.co/send-push',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'x-cron-secret', '<CRON_SECRET>'),
    body    := jsonb_build_object('job', 'photo_vote')
  );
$$);

-- Check:
-- SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE 'familycup%';
