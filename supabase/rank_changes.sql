-- ══════════════════════════════════════════════════════════════════
-- Family Cup: tell the family when the leaderboard order changes
--
-- The leaderboard only tells you where everyone stands if you go and
-- look at it. This announces the moment someone climbs past someone
-- else -- which is the part worth hearing about.
--
-- Runs on its own schedule rather than inside the points job, so it
-- also catches moves caused by a photo award, an approved request, or
-- points added by hand.
--
-- Safe to re-run.
-- ══════════════════════════════════════════════════════════════════

-- Where everyone stood the last time we looked: { profile_id: place }.
-- One row per family. Nobody reads this from the app, so it carries no
-- SELECT policy -- the function reaches it with the service role.
CREATE TABLE IF NOT EXISTS rank_snapshots (
  family_id  UUID PRIMARY KEY REFERENCES families(id) ON DELETE CASCADE,
  standings  JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE rank_snapshots ENABLE ROW LEVEL SECURITY;

-- A missing key counts as on, so existing families get these without
-- an update. This only changes the default for anyone created later.
ALTER TABLE profiles
  ALTER COLUMN notify
  SET DEFAULT '{"points": true, "events": true, "sunday": true, "photo": true, "ranks": true}'::jsonb;

-- ─── Schedule ────────────────────────────────────────────────────
-- Offset by a minute from the points job (which runs at :00, :05, ...)
-- so the points notification lands before the standings one it caused,
-- rather than the two arriving in a dead heat.
--
-- The cron secret is lifted out of an existing job rather than pasted
-- in, so it is never handled by hand.
DO $do$
DECLARE s TEXT;
BEGIN
  SELECT (regexp_match(command, $re$x-cron-secret'\s*,\s*'([^']+)'$re$))[1]
    INTO s FROM cron.job WHERE jobname = 'familycup-points';
  IF s IS NULL THEN RAISE EXCEPTION 'could not read cron secret'; END IF;
  PERFORM cron.unschedule('familycup-ranks')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'familycup-ranks');
  PERFORM cron.schedule('familycup-ranks', '1-56/5 * * * *', format($fmt$
  SELECT net.http_post(
    url     := 'https://tdprtdazqneazisdpqls.functions.supabase.co/send-push',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',%L),
    body    := jsonb_build_object('job', 'ranks'));
  $fmt$, s));
END
$do$;

-- Check:
-- SELECT family_id, standings, updated_at FROM rank_snapshots;
