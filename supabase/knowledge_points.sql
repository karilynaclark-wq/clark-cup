-- ══════════════════════════════════════════════════════════════════
-- Family Cup: adding to the family record is worth 10 too
--
-- Knowledge was paying nothing because the trigger only looked at
-- memories. Both now earn 10.
--
-- Still excluded, deliberately:
--   source = 'sheet'   — the 412 imported entries would be 4,120 points
--                        to whoever ran the import.
--   event_id NOT NULL  — the event already paid 10 for itself.
--
-- Safe to re-run.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION memory_points() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM point_submissions WHERE source_id = OLD.id;
    RETURN OLD;
  END IF;
  IF NEW.created_by IS NOT NULL
     AND NEW.source = 'app' AND NEW.event_id IS NULL THEN
    INSERT INTO point_submissions (user_id, family_id, category, custom_name, points, source_id)
    VALUES (
      NEW.created_by, NEW.family_id,
      CASE WHEN NEW.kind = 'knowledge' THEN 'knowledge_added' ELSE 'memory_added' END,
      CASE WHEN NEW.kind = 'knowledge' THEN 'Added to the family record' ELSE 'Added a memory' END,
      10, NEW.id)
    ON CONFLICT (source_id) WHERE source_id IS NOT NULL DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER TABLE point_submissions DROP CONSTRAINT IF EXISTS point_submissions_category_check;
ALTER TABLE point_submissions ADD CONSTRAINT point_submissions_category_check
  CHECK (category IN ('sunday_call', 'weekly_photo', 'board_game', 'recipe',
                      'miscellaneous', 'event_added', 'event_photo',
                      'memory_added', 'knowledge_added'));

-- Check:
-- SELECT category, count(*), sum(points) FROM point_submissions GROUP BY 1 ORDER BY 1;
