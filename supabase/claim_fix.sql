-- ══════════════════════════════════════════════════════════════════
-- Fix: joining a family never claimed the existing profile
--
-- Signup looked up the placeholder profile with a normal select, but the
-- profiles select policy is family_id = current_family_id(), and
-- current_family_id() reads the caller's own profile -- which does not
-- exist yet during signup. The lookup therefore returned nothing and a
-- second, empty profile was created instead of claiming the real one.
--
-- claim_profile() does the lookup and the link in one SECURITY DEFINER
-- step, so it is not filtered by the policy. It can only ever attach the
-- caller's own auth id, and only to an unclaimed profile.
--
-- Also merges anyone already split in two by the bug.
-- Safe to re-run.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION claim_profile(p_family UUID, p_name TEXT, p_email TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE target UUID;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;

  SELECT id INTO target
  FROM profiles
  WHERE family_id = p_family
    AND auth_user_id IS NULL
    AND lower(coalesce(first_name, username)) = lower(trim(p_name))
  LIMIT 1;

  IF target IS NULL THEN RETURN NULL; END IF;   -- caller creates a new profile

  UPDATE profiles
  SET auth_user_id = auth.uid(),
      email = coalesce(email, lower(trim(p_email)))
  WHERE id = target;

  RETURN target;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_profile(UUID, TEXT, TEXT) TO authenticated;

-- ─── Repair anyone already split in two ──────────────────────────
-- A duplicate is: a profile with a login and no points, sharing a first
-- name with an older profile in the same family that has no login.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT dupe.id AS dupe_id, dupe.auth_user_id, dupe.email, orig.id AS orig_id, orig.username
    FROM profiles dupe
    JOIN profiles orig
      ON orig.family_id = dupe.family_id
     AND orig.id <> dupe.id
     AND orig.auth_user_id IS NULL
     AND lower(coalesce(orig.first_name, orig.username))
       = lower(coalesce(dupe.first_name, dupe.username))
    WHERE dupe.auth_user_id IS NOT NULL
      AND dupe.total_points = 0
  LOOP
    -- auth_user_id is unique, so the duplicate has to let go of the login
    -- before the real profile can take it.
    UPDATE profiles SET auth_user_id = NULL WHERE id = r.dupe_id;

    UPDATE profiles
    SET auth_user_id = r.auth_user_id,
        email = coalesce(email, r.email)
    WHERE id = r.orig_id;

    DELETE FROM profiles WHERE id = r.dupe_id;
    RAISE NOTICE 'Linked login to existing profile: %', r.username;
  END LOOP;
END $$;

-- Check: everyone in The Clarks, and whether they can sign in
SELECT username, first_name, (auth_user_id IS NOT NULL) AS has_login, total_points
FROM profiles
WHERE family_id = (SELECT id FROM families WHERE name = 'The Clarks')
ORDER BY total_points DESC;
