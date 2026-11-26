-- ══════════════════════════════════════════════════════════════════
-- Family Cup: tag event memories with real names
--
-- Profiles go by house names in the app -- Hufflepuff, Ravenclaw -- but
-- the family record goes by real ones, Kari and Kelly. An event tagged
-- "Hufflepuff" therefore never appeared on Kari's timeline.
--
-- profiles.first_name already holds the real name for everyone, so the
-- trigger and the existing rows now use it.
--
-- Safe to re-run.
-- ══════════════════════════════════════════════════════════════════

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

  -- The real name, so this lands on the right person's timeline.
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

  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO point_submissions (user_id, family_id, category, custom_name, points, source_id)
    VALUES (NEW.created_by, fam, 'event_added', 'Added ' || NEW.name, 10, NEW.id)
    ON CONFLICT (source_id) WHERE source_id IS NOT NULL DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Repair the ones already written with house names.
UPDATE memories m
   SET people = ARRAY[COALESCE(NULLIF(btrim(p.first_name), ''), p.username)],
       body   = replace(m.body, 'For ' || p.username || '.',
                        'For ' || COALESCE(NULLIF(btrim(p.first_name), ''), p.username) || '.')
  FROM upcoming_events e
  JOIN profiles p ON p.id = e.profile_id
 WHERE m.event_id = e.id
   AND m.people = ARRAY[p.username];

-- Check:
-- SELECT body, people FROM memories WHERE event_id IS NOT NULL LIMIT 5;
