-- ══════════════════════════════════════════════════════════════════
-- Stopgap: let the shipped app claim a profile at signup
--
-- claim_profile() fixes this properly, but the build in the App Store
-- still does a plain select, which the family-scoped policy blocks
-- because the caller has no profile yet. Without this, Mom and Kyle get
-- an empty duplicate like Kelly and Kris did.
--
-- Deliberately narrow: it only applies while you have no profile at all,
-- which is exactly the signup moment, and only exposes profiles nobody
-- has claimed. It stops applying the instant your profile exists.
--
-- REMOVE THIS once everyone has signed in on a build that calls
-- claim_profile():
--   DROP POLICY "Signing up can find an unclaimed profile" ON profiles;
-- ══════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Signing up can find an unclaimed profile" ON profiles;

CREATE POLICY "Signing up can find an unclaimed profile"
  ON profiles FOR SELECT
  USING (
    auth_user_id IS NULL
    AND auth.uid() IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM profiles mine WHERE mine.auth_user_id = auth.uid()
    )
  );

-- Check: the policy is in place
SELECT policyname FROM pg_policies
WHERE tablename = 'profiles' AND policyname = 'Signing up can find an unclaimed profile';
