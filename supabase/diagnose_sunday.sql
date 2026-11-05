-- The Sunday call reminder has not been landing. Three questions.

-- 1. Is the job even scheduled, and still active?
SELECT jobname, schedule, active
  FROM cron.job
 WHERE jobname LIKE 'familycup%'
 ORDER BY jobname;

-- 2. Did it run on the last two Sundays, and what did it say?
--    Filtered rather than limited: the points job alone writes a row
--    every 5 minutes, so a plain LIMIT only covers a few minutes.
SELECT status_code, left(content, 200) AS response, created
  FROM net._http_response
 WHERE created > now() - interval '14 days'
   AND (content ILIKE '%sunday%' OR content ILIKE '%9:30%')
 ORDER BY created DESC
 LIMIT 20;

-- 3. Which reminder kinds have ever logged? If 'sunday' is missing
--    entirely, it has never once sent since we added the logging.
SELECT kind, count(*) AS times, max(created_at) AS most_recent
  FROM activity_events
 GROUP BY kind
 ORDER BY kind;

-- 4. Did the Sunday job run at all on those days, successful or not?
--    (Any response at all in the 14:00-16:00 UTC window on a Sunday.)
SELECT to_char(created, 'Dy YYYY-MM-DD HH24:MI') AS when_utc,
       status_code, left(content, 120) AS response
  FROM net._http_response
 WHERE created > now() - interval '14 days'
   AND extract(dow from created) = 0
   AND created::time BETWEEN '14:00' AND '16:00'
 ORDER BY created DESC;
