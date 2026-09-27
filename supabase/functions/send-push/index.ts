// Family Cup push notifications.
//
// One function, three jobs, chosen by the "job" field in the request body.
// pg_cron calls it on a schedule (see supabase/notifications.sql).
//
//   points  — every 5 min: announce any point submissions not yet announced,
//             batched into a single notification however many there are
//   events  — daily:       upcoming events that start tomorrow
//   sunday  — Sundays:     9:30 AM Chicago, the same instant for everyone
//   photo_submit — Mondays 5pm, in each person's own time zone
//   photo_vote   — Tuesdays 5pm, in each person's own time zone
//   photo_award  — Wednesdays: 100 points to the most-hearted photo
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

type Recipient = {
  token: string;
  username: string;
  timezone: string | null;
  notify: Record<string, boolean> | null;
};
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

// Wall-clock weekday and hour in someone's own time zone, for the photo
// contest reminders. An unknown zone falls back to Chicago so the reminder
// still goes out rather than silently never firing.
function localParts(timezone: string | null) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || CHICAGO,
    hour: '2-digit', weekday: 'short', hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { hour: Number(get('hour')), weekday: get('weekday') };
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
    .select('username, push_token, timezone, notify')
    .not('push_token', 'is', null);
  if (peopleErr) return Response.json({ error: peopleErr.message }, { status: 500 });

  const everyone: Recipient[] = (people ?? [])
    .filter((p) => p.push_token)
    .map((p) => ({
      token: p.push_token as string,
      username: p.username as string,
      timezone: (p as any).timezone ?? null,
      notify: (p as any).notify ?? null,
    }));

  // Opt-out, not opt-in: a missing preference means they want it.
  const wants = (key: string) => everyone.filter((r) => r.notify?.[key] !== false);
  const recipients = wants(job === 'points' ? 'points' : job === 'events' ? 'events' : 'sunday');

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
    // Cron fires at both 14:30 and 15:30 UTC so one of them is always 9:30
    // in Chicago whichever side of daylight saving we are on. This check
    // discards the one that isn't.
    if (now.weekday !== 'Sun' || now.hour !== 9 || now.minute >= 45) {
      return Response.json({ skipped: `not 9:30 Sunday in Chicago (${now.weekday} ${now.hour}:${now.minute})` });
    }
    const result = await pushEach(recipients, (r) => ({
      title: `Happy Sunday, ${r.username}!`,
      body:  'The family call is in 30 minutes — talk soon.',
    }));
    return Response.json({ job, ...result });
  }

  // Settle the photo contest: 100 points to whoever had the most hearts
  // for the week whose voting closed yesterday. Ties all win. Runs
  // Wednesdays; photo_awards stops a week ever paying out twice.
  if (job === 'photo_award') {
    const week = addDays(now.date, -2); // Wednesday back to Monday
    const [{ data: entries }, { data: votes }, { data: done }] = await Promise.all([
      supabase.from('photo_entries').select('id, family_id, profile_id').eq('week_start', week),
      supabase.from('photo_votes').select('entry_id').eq('week_start', week),
      supabase.from('photo_awards').select('family_id').eq('week_start', week),
    ]);
    if (!entries || entries.length === 0) return Response.json({ skipped: `no entries for ${week}` });

    const settled = new Set((done ?? []).map((d: any) => d.family_id));
    const hearts  = new Map<string, number>();
    for (const v of votes ?? []) {
      hearts.set((v as any).entry_id, (hearts.get((v as any).entry_id) ?? 0) + 1);
    }

    const byFamily = new Map<string, any[]>();
    for (const e of entries as any[]) {
      if (settled.has(e.family_id)) continue;
      byFamily.set(e.family_id, [...(byFamily.get(e.family_id) ?? []), e]);
    }

    const rows: any[] = [];
    const marks: any[] = [];
    for (const [familyId, familyEntries] of byFamily) {
      const top = Math.max(...familyEntries.map((e) => hearts.get(e.id) ?? 0));
      if (top === 0) continue; // nobody voted; nothing to award
      for (const e of familyEntries.filter((e) => (hearts.get(e.id) ?? 0) === top)) {
        rows.push({
          user_id: e.profile_id,
          family_id: familyId,
          category: 'weekly_photo',
          custom_name: 'Photo contest winner',
          points: 100,
        });
      }
      marks.push({ family_id: familyId, week_start: week });
    }
    if (rows.length === 0) return Response.json({ skipped: `nothing to settle for ${week}` });

    // Mark first: awarding twice is worse than not awarding, and the
    // points job will announce these on its next run either way.
    const { error: markErr } = await supabase.from('photo_awards').insert(marks);
    if (markErr) return Response.json({ error: markErr.message }, { status: 500 });
    const { error: ptsErr } = await supabase.from('point_submissions').insert(rows);
    if (ptsErr) return Response.json({ error: ptsErr.message }, { status: 500 });

    return Response.json({ job, week, winners: rows.length, families: marks.length });
  }

  // Photo contest deadlines, at 5pm wherever each person is. Cron wakes this
  // every hour; each run notifies only the people for whom it is now 5pm on
  // the right day.
  if (job === 'photo_submit' || job === 'photo_vote') {
    const wantDay = job === 'photo_submit' ? 'Mon' : 'Tue';
    const due = wants('photo').filter((r) => {
      const { hour, weekday } = localParts(r.timezone);
      return weekday === wantDay && hour === 17;
    });
    if (due.length === 0) return Response.json({ skipped: 'nobody at 5pm right now' });

    const message: Message = job === 'photo_submit'
      ? { title: '📸 Submit your photo!', body: 'Reminder: the deadline to submit your photo is today.' }
      : { title: '🗳️ Vote!',              body: 'Reminder: the deadline to vote on a photo is today.' };

    const result = await pushEach(due, () => message);
    return Response.json({ job, ...result });
  }

  return Response.json({ error: `unknown job: ${job}` }, { status: 400 });
});
