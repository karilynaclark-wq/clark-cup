-- ══════════════════════════════════════════════════════════════════
-- Family Cup: the Memories screen's weekly picks
--
-- Two things on that screen change once a week rather than on every
-- open: the suggested questions under the search box, and the single
-- memory shown in the "Memory" box.
--
-- The suggestions are written by Claude from what the family has
-- actually recorded, so they cost a request to produce. Caching them
-- per week means that cost is paid once every seven days by whoever
-- opens the screen first, instead of by everyone every time.
--
-- The week is named for its Monday, matching the photo contest.
--
-- Safe to re-run.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS memory_week (
  family_id  UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  memory_id  UUID REFERENCES memories(id) ON DELETE SET NULL,
  prompts    TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (family_id, week_start)
);

ALTER TABLE memory_week ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "This week's picks are viewable" ON memory_week;
DROP POLICY IF EXISTS "Fill in this week's picks"      ON memory_week;

CREATE POLICY "This week's picks are viewable"
  ON memory_week FOR SELECT USING (family_id = current_family_id());

-- Written by the memories Edge Function acting as whoever opened the
-- screen first that week.
CREATE POLICY "Fill in this week's picks"
  ON memory_week FOR INSERT WITH CHECK (family_id = current_family_id());

-- Check:
-- SELECT family_id, week_start, array_length(prompts, 1) FROM memory_week;
