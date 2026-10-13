-- One-off: send the photo contest vote reminder right now, instead of
-- waiting for 5pm to come round in everyone's own time zone.
--
-- Reads the cron secret straight out of the scheduled job, so the secret
-- never has to be copied around by hand.
--
-- This sends a REAL push to everyone in every family who has photo
-- notifications on and has not voted this week.

DO $$
DECLARE
  cmd    text;
  secret text;
BEGIN
  SELECT command INTO cmd FROM cron.job WHERE jobname = 'familycup-photo-vote' LIMIT 1;
  IF cmd IS NULL THEN
    RAISE EXCEPTION 'No familycup-photo-vote job scheduled -- nothing to read the secret from';
  END IF;

  secret := (regexp_match(cmd, $re$x-cron-secret','([^']+)'$re$))[1];
  IF secret IS NULL THEN
    RAISE EXCEPTION 'Could not read the cron secret out of the scheduled job';
  END IF;

  PERFORM net.http_post(
    url     := 'https://tdprtdazqneazisdpqls.functions.supabase.co/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body    := jsonb_build_object('job', 'photo_vote', 'force', true));
END $$;

-- Give it a few seconds, then check what the function said:
-- SELECT status_code, content FROM net._http_response ORDER BY created DESC LIMIT 1;

-- And what landed in the feed:
-- SELECT kind, title, body, created_at FROM activity_events ORDER BY created_at DESC LIMIT 5;
