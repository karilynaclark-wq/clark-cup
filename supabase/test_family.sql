-- ══════════════════════════════════════════════════════════════════
-- Jones Family (test) — the App Review demo family
--
-- Gives the reviewer a populated family of their own so they can see a
-- working leaderboard, point history and upcoming events without ever
-- touching real Clark family data.
--
-- Moves the existing testaccount@test.com profile out of The Clarks and
-- into this family. Its invite code is TESTER.
--
-- Safe to re-run: it clears and rebuilds the test family's contents.
-- ══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  jones   UUID;
  mom     UUID;
  dad     UUID;
  jerry   UUID;
  john    UUID;
  review  UUID;
BEGIN
  -- ── The family ───────────────────────────────────────────────
  SELECT id INTO jones FROM families WHERE name = 'Jones Family (test)';
  IF jones IS NULL THEN
    INSERT INTO families (name, join_code)
    VALUES ('Jones Family (test)', 'TESTER')
    RETURNING id INTO jones;
  ELSE
    UPDATE families SET join_code = 'TESTER' WHERE id = jones;
  END IF;

  -- ── Move the reviewer's account into it ──────────────────────
  UPDATE profiles
  SET family_id = jones
  WHERE email = 'testaccount@test.com';

  SELECT id INTO review FROM profiles WHERE email = 'testaccount@test.com';

  -- ── Start clean so re-running does not duplicate ─────────────
  DELETE FROM point_submissions WHERE family_id = jones;
  DELETE FROM upcoming_events   WHERE family_id = jones;
  DELETE FROM profiles
    WHERE family_id = jones AND username IN ('Mom', 'Dad', 'Jerry', 'John');

  -- ── The family members ───────────────────────────────────────
  -- No auth_user_id: these are unclaimed profiles, exactly like the
  -- placeholders a real family creates before everyone signs up.
  INSERT INTO profiles (username, family_id) VALUES ('Mom',   jones) RETURNING id INTO mom;
  INSERT INTO profiles (username, family_id) VALUES ('Dad',   jones) RETURNING id INTO dad;
  INSERT INTO profiles (username, family_id) VALUES ('Jerry', jones) RETURNING id INTO jerry;
  INSERT INTO profiles (username, family_id) VALUES ('John',  jones) RETURNING id INTO john;

  -- ── Point history ────────────────────────────────────────────
  -- Spread over the last few weeks so the activity feed and the
  -- leaderboard both look lived-in. total_points is filled in by the
  -- existing trigger as these land.
  INSERT INTO point_submissions (user_id, family_id, category, custom_name, points, submitted_at, notified_at) VALUES
    -- Sunday calls
    (mom,   jones, 'sunday_call',  NULL, 50, '2026-08-16 16:05:00+00', NOW()),
    (dad,   jones, 'sunday_call',  NULL, 50, '2026-08-16 16:06:00+00', NOW()),
    (jerry, jones, 'sunday_call',  NULL, 50, '2026-08-16 16:07:00+00', NOW()),
    (mom,   jones, 'sunday_call',  NULL, 50, '2026-08-23 16:04:00+00', NOW()),
    (dad,   jones, 'sunday_call',  NULL, 50, '2026-08-23 16:05:00+00', NOW()),
    (john,  jones, 'sunday_call',  NULL, 50, '2026-08-23 16:06:00+00', NOW()),
    (jerry, jones, 'sunday_call',  NULL, 50, '2026-08-30 16:03:00+00', NOW()),
    (mom,   jones, 'sunday_call',  NULL, 50, '2026-08-30 16:04:00+00', NOW()),
    (dad,   jones, 'sunday_call',  NULL, 50, '2026-09-06 16:02:00+00', NOW()),
    (john,  jones, 'sunday_call',  NULL, 50, '2026-09-06 16:03:00+00', NOW()),

    -- Photo contests
    (jerry, jones, 'weekly_photo', 'Sunset from the cabin',        100, '2026-08-18 21:30:00+00', NOW()),
    (mom,   jones, 'weekly_photo', 'The dog wearing a hat',        100, '2026-08-25 19:15:00+00', NOW()),
    (john,  jones, 'weekly_photo', 'First tomato of the season',   100, '2026-09-01 18:40:00+00', NOW()),

    -- Game nights
    (dad,   jones, 'board_game',   'Catan',      10, '2026-08-21 02:10:00+00', NOW()),
    (jerry, jones, 'board_game',   'Catan',      10, '2026-08-21 02:11:00+00', NOW()),
    (mom,   jones, 'board_game',   'Scrabble',   10, '2026-09-04 01:55:00+00', NOW()),
    (john,  jones, 'board_game',   'Scrabble',   10, '2026-09-04 01:56:00+00', NOW()),

    -- Recipes
    (mom,   jones, 'recipe',       'Sunday gravy',        30, '2026-08-27 22:20:00+00', NOW()),
    (dad,   jones, 'recipe',       'Grilled peaches',     30, '2026-09-02 23:05:00+00', NOW()),

    -- Everything else
    (jerry, jones, 'miscellaneous', 'Drove Mom to the airport at 5am',      40, '2026-08-19 12:00:00+00', NOW()),
    (john,  jones, 'miscellaneous', 'Fixed the sprinklers',                 25, '2026-08-28 20:30:00+00', NOW()),
    (dad,   jones, 'miscellaneous', 'Won the family bracket',               60, '2026-09-03 14:45:00+00', NOW()),
    (mom,   jones, 'miscellaneous', 'Sent everyone a handwritten card',     45, '2026-09-05 15:10:00+00', NOW());

  -- ── Upcoming events ──────────────────────────────────────────
  -- created_by is the reviewer's profile so they can also try deleting one.
  INSERT INTO upcoming_events (family_id, event_date, end_date, date_label, name, icon, profile_id, created_by) VALUES
    (jones, '2026-09-19', '2026-09-21', 'September 19–21', 'Jerry visiting for the weekend', '✈️', jerry,  review),
    (jones, '2026-09-27', NULL,         'September 27',    'Mom''s birthday dinner',          '🎉', mom,    review),
    (jones, '2026-10-10', '2026-10-14', 'Oct 10 – Oct 14', 'Family trip to the lake',         '🏕️', NULL,   review);
END $$;

-- Check:
SELECT f.name AS family, p.username, p.total_points
FROM profiles p JOIN families f ON f.id = p.family_id
WHERE f.name = 'Jones Family (test)'
ORDER BY p.total_points DESC;
