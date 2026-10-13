-- Why did the vote reminder not arrive? Four questions, four answers.

-- 1. What did the function actually report back?
--    Look for {"job":"photo_vote","reminded":N,...,"sent":N}
SELECT status_code, content, created
  FROM net._http_response
 ORDER BY created DESC
 LIMIT 3;

-- 2. Who is even reachable? A null token means that phone never
--    registered, so no notification of any kind can arrive.
SELECT coalesce(p.nickname, p.first_name, p.username) AS person,
       (p.push_token IS NOT NULL)                     AS has_token,
       p.timezone,
       p.notify
  FROM profiles p
  JOIN families f ON f.id = p.family_id
 WHERE f.name = 'The Clarks'
 ORDER BY person;

-- 3. Who had already voted this week, and so was deliberately skipped?
SELECT coalesce(p.nickname, p.first_name, p.username) AS voted_already
  FROM photo_votes v
  JOIN profiles p ON p.id = v.voter_id
 WHERE v.week_start = '2026-10-12';

-- 4. Did the feed row get written?
SELECT kind, title, body, created_at
  FROM activity_events
 ORDER BY created_at DESC
 LIMIT 5;
