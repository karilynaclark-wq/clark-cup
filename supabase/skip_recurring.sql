-- ══════════════════════════════════════════════════════════════════
-- Family Cup: the weekly fixtures are not memories
--
-- The Sunday call happens every week. Turning each one into a memory
-- fills the record with "Sunday call, November 15" and puts them into
-- the anniversary rotation, where they crowd out the things that only
-- happened once. Same for the photo contest, which has its own home.
--
-- They remain events, and still pay their own points when logged --
-- 50 for the call, 100 for the contest. They just do not become
-- memories.
--
-- Safe to re-run.
-- ══════════════════════════════════════════════════════════════════

-- One place to say what the standing fixtures are, so the trigger and
-- the clean-up below cannot drift apart.
CREATE OR REPLACE FUNCTION is_recurring_fixture(event_name TEXT) RETURNS BOOLEAN AS $$
  SELECT lower(btrim(coalesce(event_name, ''))) ~
         '(sunday ?call|photo ?contest|family ?call)';
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION event_becomes_memory() RETURNS TRIGGER AS $$
DECLARE
  fam  UUID;
  whom TEXT;
BEGIN
  SELECT family_id INTO fam FROM profiles WHERE id = NEW.created_by;
  IF fam IS NULL THEN
    SELECT family_id INTO fam FROM profiles WHERE id = NEW.profile_id;
  END IF;
  IF fam IS NULL THEN RETURN NEW; END IF;

  -- Points for adding it either way; a memory only if it is a one-off.
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO point_submissions (user_id, family_id, category, custom_name, points, source_id)
    VALUES (NEW.created_by, fam, 'event_added', 'Added ' || NEW.name, 10, NEW.id)
    ON CONFLICT (source_id) WHERE source_id IS NOT NULL DO NOTHING;
  END IF;

  IF is_recurring_fixture(NEW.name) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(btrim(first_name), ''), username)
    INTO whom FROM profiles WHERE id = NEW.profile_id;

  INSERT INTO memories (family_id, body, happened_on, people, source, kind, event_id, created_by)
  VALUES (
    fam,
    NEW.name || ', ' || COALESCE(NEW.date_label, to_char(NEW.event_date, 'FMDD Month YYYY'))
      || '.' || CASE WHEN whom IS NULL THEN '' ELSE ' For ' || whom || '.' END,
    NEW.event_date,
    CASE WHEN whom IS NULL THEN '{}'::text[] ELSE ARRAY[whom] END,
    'app', 'memory', NEW.id, NEW.created_by
  )
  ON CONFLICT (event_id) WHERE event_id IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Clear the ones already made. Only those nobody has photographed: a
-- picture is worth more than this rule.
DELETE FROM memories m
 USING upcoming_events e
 WHERE m.event_id = e.id
   AND is_recurring_fixture(e.name)
   AND NOT EXISTS (SELECT 1 FROM memory_photos p WHERE p.memory_id = m.id);

-- Check:
-- SELECT m.body FROM memories m JOIN upcoming_events e ON e.id = m.event_id
--   WHERE is_recurring_fixture(e.name);
