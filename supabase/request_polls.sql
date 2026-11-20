-- ══════════════════════════════════════════════════════════════════
-- Family Cup: request points for someone else, and poll on how many
--
-- Two changes to Request Points:
--
--   1. A request names who the points are FOR, which need not be the
--      person asking. Nominating someone else is half the fun.
--   2. A request may offer up to three amounts instead of one, and the
--      family picks between them.
--
-- Settling a poll:
--   most-picked amount wins
--   a tie between amounts  → the larger one (ties go to the receiver)
--   more declines than any single amount → declined
--   nobody voted at all    → the first amount, the asker's own suggestion
--
-- Safe to re-run.
-- ══════════════════════════════════════════════════════════════════

-- Who the points are for. Existing requests were all for the asker.
ALTER TABLE point_requests
  ADD COLUMN IF NOT EXISTS beneficiary_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
UPDATE point_requests SET beneficiary_id = requester_id WHERE beneficiary_id IS NULL;
ALTER TABLE point_requests ALTER COLUMN beneficiary_id SET NOT NULL;

-- The amounts on offer, largest-first ordering left to the app. NULL or
-- empty means a plain request for the single `points` value, which is
-- how every existing row behaves.
ALTER TABLE point_requests
  ADD COLUMN IF NOT EXISTS options INTEGER[];

-- At most three, all positive. A poll of one is just a request.
ALTER TABLE point_requests DROP CONSTRAINT IF EXISTS options_sane;
ALTER TABLE point_requests ADD CONSTRAINT options_sane CHECK (
  options IS NULL
  OR (array_length(options, 1) BETWEEN 2 AND 3
      AND 0 < ALL (options))
);

-- Which amount a voter picked. NULL on a decline, and NULL on a plain
-- yes/no request, where `approve` carries the whole answer.
ALTER TABLE point_request_votes
  ADD COLUMN IF NOT EXISTS choice INTEGER;

-- ─── Row Level Security ──────────────────────────────────────────
-- You may ask on your own behalf or anyone else's, as long as they are
-- in your family.
DROP POLICY IF EXISTS "Ask for your own points" ON point_requests;
DROP POLICY IF EXISTS "Ask for points"          ON point_requests;

CREATE POLICY "Ask for points"
  ON point_requests FOR INSERT WITH CHECK (
    family_id = current_family_id()
    AND requester_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
    AND beneficiary_id IN (SELECT id FROM profiles WHERE family_id = current_family_id())
  );

-- Nobody votes on points they would receive. The asker still votes when
-- the points are for someone else -- they are not the one being paid.
DROP POLICY IF EXISTS "Vote on a request" ON point_request_votes;

CREATE POLICY "Vote on a request"
  ON point_request_votes FOR INSERT WITH CHECK (
    voter_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
    AND request_id IN (
      SELECT id FROM point_requests
      WHERE family_id = current_family_id()
        AND beneficiary_id NOT IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
    )
  );

-- Check:
-- SELECT custom_name, points, options, requester_id = beneficiary_id AS for_self
--   FROM point_requests ORDER BY created_at DESC LIMIT 5;
