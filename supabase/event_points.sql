-- ══════════════════════════════════════════════════════════════════
-- Family Cup: points for building the record, and events as memories
--
-- Every event becomes a memory the moment it is added, photos or not --
-- a trip the family took is a thing that happened whether or not anyone
-- pointed a camera at it.
--
-- And three new ways to score:
--   +10  adding an upcoming event
--    +5  each photo added to an event
--   +10  adding a memory
--
-- The awards live server-side in triggers rather than in the app, for
-- two reasons: the app cannot be talked into handing out points it
-- should not, and every award carries source_id so that removing the
-- thing removes the points. Otherwise adding and deleting twenty photos
-- would be worth a free hundred points, in a game the family competes at.
--
-- Safe to re-run.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE point_submissions DROP CONSTRAINT IF EXISTS point_submissions_category_check;
ALTER TABLE point_submissions ADD CONSTRAINT point_submissions_category_check
  CHECK (category IN ('sunday_call', 'weekly_photo', 'board_game', 'recipe',
                      'miscellaneous', 'event_added', 'event_photo', 'memory_added'));

-- What earned the points. Unique so nothing can ever award twice.
ALTER TABLE point_submissions ADD COLUMN IF NOT EXISTS source_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS point_submissions_source
  ON point_submissions (source_id) WHERE source_id IS NOT NULL;

-- ── A new event becomes a memory, and pays its author ─────────────
CREATE OR REPLACE FUNCTION event_becomes_memory() RETURNS TRIGGER AS $$
DECLARE
  fam   UUID;
  whom  TEXT;
  mem   UUID;
BEGIN
  SELECT family_id INTO fam FROM profiles WHERE id = NEW.created_by;
  IF fam IS NULL THEN
    SELECT family_id INTO fam FROM profiles WHERE id = NEW.profile_id;
  END IF;
  IF fam IS NULL THEN RETURN NEW; END IF;

  SELECT username INTO whom FROM profiles WHERE id = NEW.profile_id;

  INSERT INTO memories (family_id, body, happened_on, people, source, kind, event_id, created_by)
  VALUES (
    fam,
    NEW.name || ', ' || COALESCE(NEW.date_label, to_char(NEW.event_date, 'FMDD Month YYYY'))
      || '.' || CASE WHEN whom IS NULL THEN '' ELSE ' For ' || whom || '.' END,
    NEW.event_date,
    CASE WHEN whom IS NULL THEN '{}'::text[] ELSE ARRAY[whom] END,
    'app', 'memory', NEW.id, NEW.created_by
  )
  ON CONFLICT (event_id) WHERE event_id IS NOT NULL DO NOTHING
  RETURNING id INTO mem;

  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO point_submissions (user_id, family_id, category, custom_name, points, source_id)
    VALUES (NEW.created_by, fam, 'event_added', 'Added ' || NEW.name, 10, NEW.id)
    ON CONFLICT (source_id) WHERE source_id IS NOT NULL DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_event_added ON upcoming_events;
CREATE TRIGGER on_event_added
  AFTER INSERT ON upcoming_events
  FOR EACH ROW EXECUTE FUNCTION event_becomes_memory();

-- Deleting an event nobody photographed takes its memory and its
-- points with it. One that has photos keeps the memory: the pictures
-- are the point, and they outlive the diary entry.
CREATE OR REPLACE FUNCTION event_removed() RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM point_submissions WHERE source_id = OLD.id;
  DELETE FROM memories m
   WHERE m.event_id = OLD.id
     AND NOT EXISTS (SELECT 1 FROM memory_photos p WHERE p.memory_id = m.id);
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_event_removed ON upcoming_events;
CREATE TRIGGER on_event_removed
  BEFORE DELETE ON upcoming_events
  FOR EACH ROW EXECUTE FUNCTION event_removed();

-- ── Five a photo ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION photo_points() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM point_submissions WHERE source_id = OLD.id;
    RETURN OLD;
  END IF;
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO point_submissions (user_id, family_id, category, custom_name, points, source_id)
    VALUES (NEW.created_by, NEW.family_id, 'event_photo', 'Added a photo', 5, NEW.id)
    ON CONFLICT (source_id) WHERE source_id IS NOT NULL DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_memory_photo ON memory_photos;
CREATE TRIGGER on_memory_photo
  AFTER INSERT OR DELETE ON memory_photos
  FOR EACH ROW EXECUTE FUNCTION photo_points();

-- ── Ten a memory ──────────────────────────────────────────────────
-- Only one typed into the app, and not the one an event just made for
-- itself: that already paid 10 for the event.
CREATE OR REPLACE FUNCTION memory_points() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM point_submissions WHERE source_id = OLD.id;
    RETURN OLD;
  END IF;
  IF NEW.created_by IS NOT NULL
     AND NEW.source = 'app' AND NEW.kind = 'memory' AND NEW.event_id IS NULL THEN
    INSERT INTO point_submissions (user_id, family_id, category, custom_name, points, source_id)
    VALUES (NEW.created_by, NEW.family_id, 'memory_added', 'Added a memory', 10, NEW.id)
    ON CONFLICT (source_id) WHERE source_id IS NOT NULL DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_memory_added ON memories;
CREATE TRIGGER on_memory_added
  AFTER INSERT OR DELETE ON memories
  FOR EACH ROW EXECUTE FUNCTION memory_points();

-- ── Backfill: existing events become memories ─────────────────────
-- Memories only. No points are handed out for events added before the
-- rule existed; that would quietly reshuffle the standings.
INSERT INTO memories (family_id, body, happened_on, people, source, kind, event_id, created_by)
SELECT
  COALESCE(c.family_id, f.family_id),
  e.name || ', ' || COALESCE(e.date_label, to_char(e.event_date, 'FMDD Month YYYY'))
    || '.' || CASE WHEN f.username IS NULL THEN '' ELSE ' For ' || f.username || '.' END,
  e.event_date,
  CASE WHEN f.username IS NULL THEN '{}'::text[] ELSE ARRAY[f.username] END,
  'app', 'memory', e.id, e.created_by
FROM upcoming_events e
LEFT JOIN profiles c ON c.id = e.created_by
LEFT JOIN profiles f ON f.id = e.profile_id
WHERE COALESCE(c.family_id, f.family_id) IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM memories m WHERE m.event_id = e.id);

-- Check:
-- SELECT category, count(*), sum(points) FROM point_submissions
--   WHERE category IN ('event_added','event_photo','memory_added') GROUP BY 1;
