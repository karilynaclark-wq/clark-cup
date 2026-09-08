// Family Cup push notifications.
//
// One function, three jobs, chosen by the "job" field in the request body.
// pg_cron calls it on a schedule (see supabase/notifications.sql).
//
//   points  — every 5 min: announce any point submissions not yet announced,
//             batched into a single notification however many there are
//   events  — daily:       upcoming events that start tomorrow
//   sunday  — Sundays:     30 min before the 11:00 AM Chicago family call
//
// Everyone with a saved push token gets every notification. Copy is built
// per recipient, so the Sunday reminder can greet each person by name.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHICAGO = 'America/Chicago';

// Falls back to a readable phrase when a submission has no custom_name.
const CATEGORY_PHRASE: Record<string, string> = {
  sunday_call:   'the Sunday call',
  weekly_photo:  'the photo contest',
  miscellaneous: 'being awesome',
};

type Recipient = { token: string; username: string };
type Message   = { title: string; body: string };

// Wall-clock parts in Chicago, whatever the server's own clock says.
function chicagoNow() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CHICAGO,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short',
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return {
    date:    `${get('year')}-${get('month')}-${get('day')}`,
    hour:    Number(get('hour')),
    minute:  Number(get('minute')),
    weekday: get('weekday'),
  };
}

function addDays(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

// build() runs per recipient so copy can use their own name.
// Expo accepts at most 100 messages per request.
async function pushEach(recipients: Recipient[], build: (r: Recipient) => Message) {
  if (recipients.length === 0) return { sent: 0 };
  let sent = 0;
  for (let i = 0; i < recipients.length; i += 100) {
    const batch = recipients.slice(i, i + 100).map((r) => ({
      to: r.token, sound: 'default', ...build(r),
    }));
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(batch),
    });
    if (!res.ok) throw new Error(`Expo push failed: ${res.status} ${await res.text()}`);
    sent += batch.length;
  }
  return { sent };
}

Deno.serve(async (req) => {
  // Only our own cron jobs may trigger this.
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { job } = await req.json().catch(() => ({ job: null }));
  const now = chicagoNow();

  // Everyone who has opened the app and granted permission.
  const { data: people, error: peopleErr } = await supabase
    .from('profiles')
    .select('username, push_token')
    .not('push_token', 'is', null);
  if (peopleErr) return Response.json({ error: peopleErr.message }, { status: 500 });

  const recipients: Recipient[] = (people ?? [])
    .filter((p) => p.push_token)
    .map((p) => ({ token: p.push_token as string, username: p.username as string }));

  if (job === 'points') {
    // Everything logged since the last run, so a flurry of entries becomes one buzz.
    const { data: fresh, error } = await supabase
      .from('point_submissions')
      .select('id, points, category, custom_name, profiles!user_id(username)')
      .is('notified_at', null);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!fresh || fresh.length === 0) return Response.json({ skipped: 'nothing new' });

    const describe = (s: any) =>
      s.custom_name?.trim() || CATEGORY_PHRASE[s.category] || 'being awesome';
    const line = (s: any) =>
      `${s.profiles?.username ?? 'Someone'} just got ${s.points} points for ${describe(s)}`;

    let body: string;
    if (fresh.length === 1) {
      body = `${line(fresh[0])}!`;
    } else {
      const shown = fresh.slice(0, 3).map(line).join(' · ');
      const rest  = fresh.length - 3;
      body = rest > 0 ? `${shown} · and ${rest} more` : shown;
    }

    const result = await pushEach(recipients, () => ({ title: '🏆 New points', body }));

    // Mark them announced only after the send succeeded, so a failure retries.
    await supabase
      .from('point_submissions')
      .update({ notified_at: new Date().toISOString() })
      .in('id', fresh.map((s: any) => s.id));

    return Response.json({ job, entries: fresh.length, preview: body, ...result });
  }

  if (job === 'events') {
    const tomorrow = addDays(now.date, 1);
    const { data: events, error } = await supabase
      .from('upcoming_events')
      .select('name, icon, profiles!profile_id(username)')
      .eq('event_date', tomorrow);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!events || events.length === 0) return Response.json({ skipped: 'nothing tomorrow' });

    let message: Message;
    if (events.length === 1) {
      const e   = events[0] as any;
      const who = e.profiles?.username;
      message = who
        ? { title: `Have fun, ${who}!`, body: `${e.name} is tomorrow for ${who}!` }
        : { title: 'Have fun, everyone!', body: `${e.name} is tomorrow!` };
    } else {
      message = {
        title: 'Have fun, everyone!',
        body: `Tomorrow: ${joinNames((events as any[]).map((e) => e.name))}!`,
      };
    }

    const result = await pushEach(recipients, () => message);
    return Response.json({ job, events: events.length, preview: message, ...result });
  }

  if (job === 'sunday') {
    // Cron fires at both 15:30 and 16:30 UTC so one of them is always 10:30
    // in Chicago whichever side of daylight saving we are on. This check
    // discards the one that isn't.
    if (now.weekday !== 'Sun' || now.hour !== 10 || now.minute >= 45) {
      return Response.json({ skipped: `not 10:30 Sunday in Chicago (${now.weekday} ${now.hour}:${now.minute})` });
    }
    const result = await pushEach(recipients, (r) => ({
      title: `Happy Sunday, ${r.username}!`,
      body:  'The family call is in 30 minutes — talk soon.',
    }));
    return Response.json({ job, ...result });
  }

  return Response.json({ error: `unknown job: ${job}` }, { status: 400 });
});
