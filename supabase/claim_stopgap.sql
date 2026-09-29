-- ══════════════════════════════════════════════════════════════════
-- Stopgap: let the shipped app claim a profile at signup
--
-- claim_profile() fixes this properly, but the build in the App Store
-- still does a plain select, which the family-scoped policy blocks
-- because the caller has no profile yet.
--
-- The check for "does this person already have a profile" must NOT be a
-- subquery on profiles: a policy on profiles that reads profiles recurses,
-- and Postgres fails every read with 42P17. It goes in a SECURITY DEFINER
-- function instead, which runs outside RLS.
--
-- REMOVE once everyone is on a build that calls claim_profile():
--   DROP POLICY "Signing up can find an unclaimed profile" ON profiles;
--   DROP FUNCTION has_profile();
-- ══════════════════════════════════════════════════════════════════

-- Clear the recursive version if it is still there.
DROP POLICY IF EXISTS "Signing up can find an unclaimed profile" ON profiles;

CREATE OR REPLACE FUNCTION has_profile()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid());
$$;

GRANT EXECUTE ON FUNCTION has_profile() TO authenticated;

CREATE POLICY "Signing up can find an unclaimed profile"
  ON profiles FOR SELECT
  USING (
    auth_user_id IS NULL
    AND auth.uid() IS NOT NULL
    AND NOT has_profile()
  );

-- Check: existing members can still read their family
SELECT username, total_points FROM profiles
WHERE family_id = (SELECT id FROM families WHERE name = 'The Clarks')
ORDER BY total_points DESC;
