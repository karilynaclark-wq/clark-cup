-- Send one test email, to one address, through the real mail path.
-- Nobody else is touched: no push, no family-wide send.
--
-- Reads the cron secret out of an existing scheduled job so the secret
-- never has to be copied by hand.

DO $$
DECLARE
  cmd    text;
  secret text;
BEGIN
  SELECT command INTO cmd FROM cron.job WHERE jobname = 'familycup-points' LIMIT 1;
  IF cmd IS NULL THEN
    RAISE EXCEPTION 'No familycup-points job scheduled to read the secret from';
  END IF;

  secret := (regexp_match(cmd, $re$x-cron-secret','([^']+)'$re$))[1];
  IF secret IS NULL THEN
    RAISE EXCEPTION 'Could not read the cron secret out of the scheduled job';
  END IF;

  PERFORM net.http_post(
    url     := 'https://tdprtdazqneazisdpqls.functions.supabase.co/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body    := jsonb_build_object(
                 'job', 'email_test',
                 'to',  'karilynaclark@gmail.com'));
END $$;

-- Wait a few seconds, then run this on its own to see what happened.
-- {"job":"email_test","emailed":1} means it sent.
-- {"emailed":0} means the secrets are not set.
-- A 500 with an SMTP message means Gmail refused the credentials.
SELECT status_code, left(content, 300) AS response, created
  FROM net._http_response
 WHERE created > now() - interval '3 minutes'
 ORDER BY created DESC
 LIMIT 5;
