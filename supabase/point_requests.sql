-- ══════════════════════════════════════════════════════════════════
-- Family Cup: requesting points
--
-- Add Points awards immediately. Request Points asks the family first:
-- everyone is notified, and it appears under Pending Points on Home.
--
--   any approval            → approved, points awarded
--   everyone else rejects   → declined
--   48 hours with no votes  → approved
--
-- Safe to re-run. Replace <CRON_SECRET> before running.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS point_requests (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id    UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  custom_name  TEXT NOT NULL,
  points       INTEGER NOT NULL CHECK (points > 0),
  notes        TEXT,
  photo_url    TEXT,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'approved', 'declined')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at  TIMESTAMPTZ,
  -- NULL until the family has been told about it, so the notifier can
  -- pick up new requests exactly once.
  notified_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS point_request_votes (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES point_requests(id) ON DELETE CASCADE,
  voter_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  approve    BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT one_vote_per_request UNIQUE (request_id, voter_id)
);

CREATE INDEX IF NOT EXISTS point_requests_pending
  ON point_requests (family_id, created_at DESC) WHERE status = 'pending';

-- ─── Row Level Security ──────────────────────────────────────────
ALTER TABLE point_requests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_request_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Requests in your family are viewable" ON point_requests;
DROP POLICY IF EXISTS "Ask for your own points"              ON point_requests;
DROP POLICY IF EXISTS "Your family can resolve a request"    ON point_requests;
DROP POLICY IF EXISTS "Request votes in your family"         ON point_request_votes;
DROP POLICY IF EXISTS "Vote on a request"                    ON point_request_votes;

CREATE POLICY "Requests in your family are viewable"
  ON point_requests FOR SELECT USING (family_id = current_family_id());

CREATE POLICY "Ask for your own points"
  ON point_requests FOR INSERT WITH CHECK (
    family_id = current_family_id()
    AND requester_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
  );

-- Anyone in the family can settle a request, since approving is exactly
-- what the rest of the family is here to do.
CREATE POLICY "Your family can resolve a request"
  ON point_requests FOR UPDATE USING (family_id = current_family_id());

CREATE POLICY "Request votes in your family"
  ON point_request_votes FOR SELECT USING (
    request_id IN (SELECT id FROM point_requests WHERE family_id = current_family_id())
  );

CREATE POLICY "Vote on a request"
  ON point_request_votes FOR INSERT WITH CHECK (
    voter_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
    AND request_id IN (SELECT id FROM point_requests WHERE family_id = current_family_id())
  );

-- ─── Notify and expire ───────────────────────────────────────────
-- Hourly: tells the family about new requests, and approves anything that
-- has sat unanswered for 48 hours.
SELECT cron.unschedule('familycup-requests')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'familycup-requests');

SELECT cron.schedule('familycup-requests', '*/10 * * * *', $$
  SELECT net.http_post(
    url     := 'https://tdprtdazqneazisdpqls.functions.supabase.co/send-push',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<CRON_SECRET>'),
    body    := jsonb_build_object('job', 'requests'));
$$);

-- Check:
-- SELECT status, count(*) FROM point_requests GROUP BY 1;
