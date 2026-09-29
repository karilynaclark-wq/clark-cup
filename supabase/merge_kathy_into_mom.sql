-- ══════════════════════════════════════════════════════════════════
-- Merge the "Kathy" profile into "Mom"
--
-- She signed up as Kathy, so no existing profile matched and a new one
-- was created. This moves her login (and anything she has already done)
-- onto the Mom profile that holds the point history, then removes the
-- duplicate. Her email and password do not change.
-- ══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  fam    UUID := (SELECT id FROM families WHERE name = 'The Clarks');
  kathy  RECORD;
  mom_id UUID;
BEGIN
  SELECT id, auth_user_id, email INTO kathy
  FROM profiles
  WHERE family_id = fam
    AND lower(coalesce(first_name, username)) = 'kathy'
  LIMIT 1;

  SELECT id INTO mom_id
  FROM profiles
  WHERE family_id = fam
    AND lower(coalesce(first_name, username)) = 'mom'
  LIMIT 1;

  IF kathy.id IS NULL THEN RAISE EXCEPTION 'No Kathy profile found in The Clarks'; END IF;
  IF mom_id IS NULL     THEN RAISE EXCEPTION 'No Mom profile found in The Clarks';   END IF;

  -- Anything she did under the new profile comes with her.
  UPDATE point_submissions   SET user_id    = mom_id WHERE user_id    = kathy.id;
  UPDATE photo_entries       SET profile_id = mom_id WHERE profile_id = kathy.id;
  UPDATE photo_votes         SET voter_id   = mom_id WHERE voter_id   = kathy.id;
  UPDATE point_requests      SET requester_id = mom_id WHERE requester_id = kathy.id;
  UPDATE upcoming_events     SET profile_id = mom_id WHERE profile_id = kathy.id;
  UPDATE upcoming_events     SET created_by = mom_id WHERE created_by = kathy.id;

  -- auth_user_id is unique, so the duplicate releases the login first.
  UPDATE profiles SET auth_user_id = NULL WHERE id = kathy.id;

  UPDATE profiles
  SET auth_user_id = kathy.auth_user_id,
      email        = coalesce(email, kathy.email)
  WHERE id = mom_id;

  DELETE FROM profiles WHERE id = kathy.id;

  -- Totals only move on insert, so recompute after shuffling rows about.
  UPDATE profiles p
  SET total_points = COALESCE((SELECT SUM(points) FROM point_submissions s WHERE s.user_id = p.id), 0)
  WHERE p.family_id = fam;
END $$;

SELECT username, first_name, (auth_user_id IS NOT NULL) AS has_login, total_points
FROM profiles
WHERE family_id = (SELECT id FROM families WHERE name = 'The Clarks')
ORDER BY total_points DESC;
