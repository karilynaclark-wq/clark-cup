-- ══════════════════════════════════════════════════════════════════
-- Family Cup: settling the photo contest automatically
--
-- Every Wednesday the previous day's voting is tallied and 100 points go
-- to whoever has the most hearts. Ties all win.
--
-- photo_awards records which weeks have already paid out, so a retry or
-- a second cron run cannot award the same week twice.
--
-- Safe to re-run. Replace <CRON_SECRET> before running.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS photo_awards (
  family_id  UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (family_id, week_start)
);

ALTER TABLE photo_awards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Awards in your family are viewable" ON photo_awards;
CREATE POLICY "Awards in your family are viewable"
  ON photo_awards FOR SELECT USING (family_id = current_family_id());
-- Writes happen only from the scheduled job, which uses the service role.

SELECT cron.unschedule('familycup-photo-award')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'familycup-photo-award');

-- Wednesdays at 14:00 UTC (9am Chicago), the morning after voting closes.
SELECT cron.schedule('familycup-photo-award', '0 14 * * 3', $$
  SELECT net.http_post(
    url     := 'https://tdprtdazqneazisdpqls.functions.supabase.co/send-push',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<CRON_SECRET>'),
    body    := jsonb_build_object('job', 'photo_award'));
$$);

-- Check:
-- SELECT * FROM photo_awards ORDER BY week_start DESC;
