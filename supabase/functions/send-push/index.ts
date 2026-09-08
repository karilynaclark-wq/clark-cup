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
// Everyone with a saved push token gets every notification.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHICAGO = 'America/Chicago';

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

// Expo accepts at most 100 messages per request.
async function pushToAll(tokens: string[], title: string, body: string) {
  if (tokens.length === 0) return { sent: 0 };
  let sent = 0;
  for (let i = 0; i < tokens.length; i += 100) {
    const batch = tokens.slice(i, i + 100).map((to) => ({
      to, title, body, sound: 'default',
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
    .select('push_token')
    .not('push_token', 'is', null);
  if (peopleErr) return Response.json({ error: peopleErr.message }, { status: 500 });

  const tokens = (people ?? []).map((p) => p.push_token as string).filter(Boolean);

  if (job === 'points') {
    // Everything logged since the last run, so a flurry of entries becomes one buzz.
    const { data: fresh, error } = await supabase
      .from('point_submissions')
      .select('id, points, profiles!user_id(username)')
      .is('notified_at', null);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!fresh || fresh.length === 0) return Response.json({ skipped: 'nothing new' });

    const names = [...new Set(fresh.map((s: any) => s.profiles?.username).filter(Boolean))];
    const total = fresh.reduce((sum: number, s: any) => sum + (s.points ?? 0), 0);

    const body =
      fresh.length === 1
        ? `${names[0]} just earned ${total} points.`
        : names.length === 1
          ? `${names[0]} just earned ${total} points across ${fresh.length} entries.`
          : `${names.slice(0, -1).join(', ')} and ${names.at(-1)} earned ${total} points.`;

    const result = await pushToAll(tokens, '🏆 New points', body);

    // Mark them announced only after the send succeeded, so a failure retries.
    await supabase
      .from('point_submissions')
      .update({ notified_at: new Date().toISOString() })
      .in('id', fresh.map((s: any) => s.id));

    return Response.json({ job, entries: fresh.length, ...result });
  }

  if (job === 'events') {
    const tomorrow = addDays(now.date, 1);
    const { data: events, error } = await supabase
      .from('upcoming_events')
      .select('name, icon, profiles!profile_id(username)')
      .eq('event_date', tomorrow);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!events || events.length === 0) return Response.json({ skipped: 'nothing tomorrow' });

    const body =
      events.length === 1
        ? `${events[0].icon ?? '✈️'} ${events[0].name} starts tomorrow.`
        : `${events.length} things start tomorrow: ${events.map((e: any) => e.name).join(', ')}.`;

    const result = await pushToAll(tokens, 'Tomorrow', body);
    return Response.json({ job, events: events.length, ...result });
  }

  if (job === 'sunday') {
    // Cron fires at both 15:30 and 16:30 UTC so one of them is always 10:30
    // in Chicago whichever side of daylight saving we are on. This check
    // discards the one that isn't.
    if (now.weekday !== 'Sun' || now.hour !== 10 || now.minute >= 45) {
      return Response.json({ skipped: `not 10:30 Sunday in Chicago (${now.weekday} ${now.hour}:${now.minute})` });
    }
    const result = await pushToAll(
      tokens,
      '📞 Sunday call',
      'Family call in 30 minutes — worth 50 points.',
    );
    return Response.json({ job, ...result });
  }

  return Response.json({ error: `unknown job: ${job}` }, { status: 400 });
});
