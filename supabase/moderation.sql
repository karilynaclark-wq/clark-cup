-- ══════════════════════════════════════════════════════════════════
-- Family Cup: content moderation
--
-- Required by App Store Review Guideline 1.2 for apps with
-- user-generated content: terms with no tolerance for objectionable
-- content, a way to report it, a way to remove an abusive user, and
-- removal within 24 hours.
--
-- Safe to re-run.
-- ══════════════════════════════════════════════════════════════════

-- Hidden entries stay in the table (so a report can be reviewed) but the
-- app filters them out for everyone.
ALTER TABLE photo_entries ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS photo_reports (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_id    UUID NOT NULL REFERENCES photo_entries(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  family_id   UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT one_report_each UNIQUE (entry_id, reporter_id)
);

ALTER TABLE photo_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "See your own reports" ON photo_reports;
DROP POLICY IF EXISTS "Report a photo"       ON photo_reports;

CREATE POLICY "See your own reports"
  ON photo_reports FOR SELECT USING (
    reporter_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Report a photo"
  ON photo_reports FOR INSERT WITH CHECK (
    family_id = current_family_id()
    AND reporter_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
  );

-- Reporting hides the photo from everyone straight away, so objectionable
-- content stops being visible the moment someone flags it rather than
-- whenever it is next reviewed.
CREATE OR REPLACE FUNCTION hide_reported_entry()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE photo_entries SET hidden = true WHERE id = NEW.entry_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_photo_reported ON photo_reports;
CREATE TRIGGER on_photo_reported
  AFTER INSERT ON photo_reports
  FOR EACH ROW EXECUTE FUNCTION hide_reported_entry();

-- ─── Removing someone from your family ───────────────────────────
-- Anyone in the family can remove anyone else (but not themselves). The
-- person keeps their login and can join another family with a code; their
-- photos go with them.
CREATE OR REPLACE FUNCTION remove_from_family(target_profile UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  me     UUID;
  my_fam UUID;
BEGIN
  SELECT id, family_id INTO me, my_fam
  FROM profiles WHERE auth_user_id = auth.uid();

  IF me IS NULL OR my_fam IS NULL THEN RETURN false; END IF;
  IF target_profile = me THEN RETURN false; END IF;            -- use Delete Account
  IF NOT EXISTS (SELECT 1 FROM profiles
                 WHERE id = target_profile AND family_id = my_fam) THEN
    RETURN false;                                              -- not yours to remove
  END IF;

  DELETE FROM photo_entries WHERE profile_id = target_profile;
  UPDATE profiles SET family_id = NULL WHERE id = target_profile;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION remove_from_family(UUID) TO authenticated;

-- Review reported photos:
-- SELECT r.created_at, p.username AS reported_by, e.photo_url, e.hidden
-- FROM photo_reports r
-- JOIN photo_entries e ON e.id = r.entry_id
-- JOIN profiles p ON p.id = r.reporter_id
-- ORDER BY r.created_at DESC;
