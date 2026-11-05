-- Two questions: why did nobody get Sunday's reminder, and why does one
-- particular phone never get any of them?

-- 1. Is the Sunday job still scheduled, and is it still active?
SELECT jobname, schedule, active
  FROM cron.job
 WHERE jobname LIKE 'familycup%'
 ORDER BY jobname;

-- 2. Did it actually run on Sunday, and what came back? A 2xx with
--    {"skipped": ...} means it ran and decided not to send.
SELECT r.status_code,
       left(r.content, 200) AS response,
       r.created
  FROM net._http_response r
 WHERE r.created > now() - interval '3 days'
 ORDER BY r.created DESC
 LIMIT 20;

-- 3. Which reminders have been logged lately? Sunday should appear here
--    with kind = 'sunday' if it sent.
SELECT kind, title, created_at
  FROM activity_events
 WHERE created_at > now() - interval '10 days'
 ORDER BY created_at DESC;

-- 4. Who can actually be reached? A null token is a phone that never
--    registered, and no notification of any kind can arrive there.
SELECT coalesce(p.nickname, p.first_name, p.username) AS person,
       (p.push_token IS NOT NULL) AS has_token,
       left(coalesce(p.push_token, ''), 18) AS token_starts,
       p.timezone,
       p.notify
  FROM profiles p
  JOIN families f ON f.id = p.family_id
 WHERE f.name = 'The Clarks'
 ORDER BY person;
