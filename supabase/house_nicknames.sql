-- Make the house nickname the name shown everywhere.
--
-- `username` is the resolved display name the whole app reads -- the
-- profile screen already writes nickname-else-first-name into it on save.
-- The crest migration set nickname only, so this catches username up.

DO $$
DECLARE
  fam uuid;
  hit int;
BEGIN
  SELECT id INTO fam FROM families WHERE name = 'The Clarks';
  IF fam IS NULL THEN
    RAISE EXCEPTION 'No family named The Clarks';
  END IF;

  UPDATE profiles
     SET username = nickname
   WHERE family_id = fam
     AND nickname IS NOT NULL
     AND nickname <> ''
     AND username IS DISTINCT FROM nickname;
  GET DIAGNOSTICS hit = ROW_COUNT;
  RAISE NOTICE 'Renamed % profiles', hit;
END $$;

SELECT first_name, nickname, username
  FROM profiles p
  JOIN families f ON f.id = p.family_id
 WHERE f.name = 'The Clarks'
 ORDER BY first_name;
