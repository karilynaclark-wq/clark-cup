-- ══════════════════════════════════════════════════════════════════
-- Family photo
--
-- Replaces the trophy tile in each page's header with a photo the
-- family chooses. Any member can set it.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE families ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- Members can already edit their family's Quick Add cards; the same
-- policy covers the photo. Recreated here so this file stands alone.
DROP POLICY IF EXISTS "Your family is editable" ON families;
CREATE POLICY "Your family is editable"
  ON families FOR UPDATE
  USING (id = current_family_id())
  WITH CHECK (id = current_family_id());

-- Check:
-- SELECT name, photo_url FROM families;
