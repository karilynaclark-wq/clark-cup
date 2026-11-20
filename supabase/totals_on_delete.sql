-- ══════════════════════════════════════════════════════════════════
-- Family Cup: keep total_points right when a submission changes or goes
--
-- The totals trigger only ever fired on INSERT, so deleting a points
-- entry -- or editing one -- left the total standing at the old figure.
-- Points could go up and never come down, and nothing in the app said
-- so. Found when a test entry was removed and the total stayed put.
--
-- Recomputes both sides of an UPDATE, since a submission moved from one
-- person to another has to lower the first and raise the second.
--
-- Safe to re-run.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_total_points()
RETURNS TRIGGER AS $$
DECLARE touched UUID[];
BEGIN
  -- Whoever this row belonged to, and whoever it belongs to now.
  touched := ARRAY(
    SELECT DISTINCT x FROM unnest(ARRAY[
      CASE WHEN TG_OP <> 'INSERT' THEN OLD.user_id END,
      CASE WHEN TG_OP <> 'DELETE' THEN NEW.user_id END
    ]) AS x WHERE x IS NOT NULL
  );

  UPDATE profiles p
  SET total_points = (
        SELECT COALESCE(SUM(points), 0)
        FROM point_submissions WHERE user_id = p.id
      ),
      updated_at = NOW()
  WHERE p.id = ANY(touched);

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_submission_insert ON point_submissions;
DROP TRIGGER IF EXISTS on_submission_change ON point_submissions;

CREATE TRIGGER on_submission_change
  AFTER INSERT OR UPDATE OR DELETE ON point_submissions
  FOR EACH ROW EXECUTE FUNCTION update_total_points();

-- Put right anything that drifted while deletes went unnoticed.
UPDATE profiles p
SET total_points = (
      SELECT COALESCE(SUM(points), 0)
      FROM point_submissions WHERE user_id = p.id
    )
WHERE p.total_points <> (
      SELECT COALESCE(SUM(points), 0)
      FROM point_submissions WHERE user_id = p.id
    );

-- Check: should return no rows.
-- SELECT p.username, p.total_points, COALESCE(SUM(s.points), 0) AS actual
--   FROM profiles p LEFT JOIN point_submissions s ON s.user_id = p.id
--  GROUP BY 1, 2 HAVING p.total_points <> COALESCE(SUM(s.points), 0);
