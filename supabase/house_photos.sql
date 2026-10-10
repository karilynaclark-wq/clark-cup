-- House crests as the family photo and each member's avatar, plus the
-- house name as their nickname. Images live in the repo (public), so
-- nothing needs uploading to storage.
--
-- Match on first name OR username, because a nickname set earlier
-- (Hufflepuff, Mom) replaces the display name in some places.

DO $$
DECLARE
  base    text := 'https://raw.githubusercontent.com/karilynaclark-wq/clark-cup/main/assets/houses/';
  fam     uuid;
  people  text[][] := ARRAY[
    ['kari',  'Hufflepuff', 'hufflepuff'],
    ['kris',  'Gryffindor', 'gryffindor'],
    ['kelly', 'Ravenclaw',  'ravenclaw'],
    ['kyle',  'Slytherin',  'slytherin'],
    ['mom',   'Professor',  'professor']
  ];
  i       int;
  hit     int;
BEGIN
  SELECT id INTO fam FROM families WHERE name = 'The Clarks';
  IF fam IS NULL THEN
    RAISE EXCEPTION 'No family named The Clarks';
  END IF;

  UPDATE families SET photo_url = base || 'clarks.jpg' WHERE id = fam;

  FOR i IN 1 .. array_length(people, 1) LOOP
    UPDATE profiles
       SET nickname   = people[i][2],
           avatar_url = base || people[i][3] || '.jpg'
     WHERE family_id = fam
       AND lower(coalesce(first_name, username)) = people[i][1];
    GET DIAGNOSTICS hit = ROW_COUNT;
    IF hit <> 1 THEN
      RAISE EXCEPTION 'Expected 1 profile for %, found %', people[i][1], hit;
    END IF;
  END LOOP;
END $$;

-- What it looks like now
SELECT coalesce(p.first_name, p.username) AS person, p.nickname, p.avatar_url
  FROM profiles p
  JOIN families f ON f.id = p.family_id
 WHERE f.name = 'The Clarks'
 ORDER BY person;
