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
//   requests     — every 10 min: announce new point requests, approve stale ones
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
  id: string;
  token: string;
  username: string;
  familyId: string | null;
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
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', weekday: 'short', hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return {
    hour: Number(get('hour')),
    weekday: get('weekday'),
    date: `${get('year')}-${get('month')}-${get('day')}`,
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
    .select('id, username, push_token, timezone, notify, family_id')
    .not('push_token', 'is', null);
  if (peopleErr) return Response.json({ error: peopleErr.message }, { status: 500 });

  const everyone: Recipient[] = (people ?? [])
    .filter((p) => p.push_token)
    .map((p) => ({
      id: (p as any).id as string,
      token: p.push_token as string,
      username: p.username as string,
      familyId: (p as any).family_id ?? null,
      timezone: (p as any).timezone ?? null,
      notify: (p as any).notify ?? null,
    }));

  // Opt-out, not opt-in: a missing preference means they want it.
  const wants = (key: string) => everyone.filter((r) => r.notify?.[key] !== false);
  // Sunday and the photo deadlines say nothing family-specific, so they go
  // to everyone who wants them. Points and events are scoped per family below.
  const recipients = wants('sunday');

  if (job === 'points') {
    // Everything logged since the last run, so a flurry of entries becomes one buzz.
    const { data: fresh, error } = await supabase
      .from('point_submissions')
      .select('id, points, category, custom_name, family_id, profiles!user_id(username)')
      .is('notified_at', null);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!fresh || fresh.length === 0) return Response.json({ skipped: 'nothing new' });

    const describe = (s: any) =>
      s.custom_name?.trim() || CATEGORY_PHRASE[s.category] || 'being awesome';

    // Everyone who got the same points for the same thing is named once,
    // so a family call reads "Kari, Kelly and Kris each got 50 points for
    // the Sunday call" instead of the same sentence three times over.
    const group = (list: any[]) => {
      const byReason = new Map<string, { points: number; what: string; names: string[] }>();
      for (const s of list) {
        const what = describe(s);
        const key = `${s.points}|${what}`;
        const g = byReason.get(key) ?? { points: s.points, what, names: [] };
        const who = s.profiles?.username ?? 'Someone';
        if (!g.names.includes(who)) g.names.push(who);
        byReason.set(key, g);
      }
      return [...byReason.values()].map((g) =>
        g.names.length === 1
          ? `${g.names[0]} just got ${g.points} points for ${g.what}`
          : `${joinNames(g.names)} each got ${g.points} points for ${g.what}`,
      );
    };

    // Each family hears only about itself. The service role bypasses RLS, so
    // without this everyone would be told every family's news.
    const byFamily = new Map<string, any[]>();
    for (const row of fresh as any[]) {
      if (!row.family_id) continue;
      byFamily.set(row.family_id, [...(byFamily.get(row.family_id) ?? []), row]);
    }

    let sent = 0;
    for (const [familyId, rows] of byFamily) {
      const audience = wants('points').filter((r) => r.familyId === familyId);
      if (audience.length === 0) continue;

      const lines = group(rows);
      const shown = lines.slice(0, 3).join(' · ');
      const rest  = lines.length - 3;
      const body  = rest > 0
        ? `${shown} · and ${rest} more`
        : lines.length === 1 ? `${shown}!` : shown;
      const r = await pushEach(audience, () => ({ title: '🏆 New points', body }));
      sent += r.sent;
    }

    // Mark them announced only after the send succeeded, so a failure retries.
    await supabase
      .from('point_submissions')
      .update({ notified_at: new Date().toISOString() })
      .in('id', (fresh as any[]).map((s) => s.id));

    return Response.json({ job, entries: fresh.length, families: byFamily.size, sent });
  }

  if (job === 'events') {
    const tomorrow = addDays(now.date, 1);
    const { data: events, error } = await supabase
      .from('upcoming_events')
      .select('name, icon, family_id, profiles!profile_id(username)')
      .eq('event_date', tomorrow);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!events || events.length === 0) return Response.json({ skipped: 'nothing tomorrow' });

    const byFamily = new Map<string, any[]>();
    for (const e of events as any[]) {
      if (!e.family_id) continue;
      byFamily.set(e.family_id, [...(byFamily.get(e.family_id) ?? []), e]);
    }

    let sent = 0;
    for (const [familyId, list] of byFamily) {
      const audience = wants('events').filter((r) => r.familyId === familyId);
      if (audience.length === 0) continue;

      let message: Message;
      if (list.length === 1) {
        const who = list[0].profiles?.username;
        message = who
          ? { title: `Have fun, ${who}!`, body: `${list[0].name} is tomorrow for ${who}!` }
          : { title: 'Have fun, everyone!', body: `${list[0].name} is tomorrow!` };
      } else {
        message = {
          title: 'Have fun, everyone!',
          body: `Tomorrow: ${joinNames(list.map((e) => e.name))}!`,
        };
      }
      const r = await pushEach(audience, () => message);
      sent += r.sent;
    }

    return Response.json({ job, events: events.length, families: byFamily.size, sent });
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

  // Point requests: tell the family about new ones, and approve anything
  // nobody answered within 48 hours.
  if (job === 'requests') {
    const { data: fresh } = await supabase
      .from('point_requests')
      .select('id, family_id, points, custom_name, profiles!requester_id(username)')
      .eq('status', 'pending')
      .is('notified_at', null);

    let announced = 0;
    for (const r of (fresh ?? []) as any[]) {
      const audience = wants('points').filter((x) => x.familyId === r.family_id);
      if (audience.length > 0) {
        const who = r.profiles?.username ?? 'Someone';
        await pushEach(audience, () => ({
          title: '🙋 Points requested',
          body: `${who} is asking for ${r.points} points for ${r.custom_name}. Approve or decline in the app.`,
        }));
        announced += audience.length;
      }
      await supabase.from('point_requests')
        .update({ notified_at: new Date().toISOString() }).eq('id', r.id);
    }

    // Settle anything that has been open 48 hours. No votes counts as a
    // yes; a tie goes to the requester; more rejections than approvals is
    // the only way a request is declined.
    const cutoff = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const { data: stale } = await supabase
      .from('point_requests')
      .select('id, family_id, requester_id, points, custom_name, notes, photo_url')
      .eq('status', 'pending')
      .lt('created_at', cutoff);

    let approved = 0, declined = 0;
    for (const r of (stale ?? []) as any[]) {
      const { data: cast } = await supabase
        .from('point_request_votes').select('approve').eq('request_id', r.id);
      const yes = (cast ?? []).filter((v: any) => v.approve).length;
      const no  = (cast ?? []).length - yes;

      if (no > yes) {
        await supabase.from('point_requests')
          .update({ status: 'declined', resolved_at: new Date().toISOString() })
          .eq('id', r.id);
        declined += 1;
        continue;
      }

      const { error } = await supabase.from('point_submissions').insert({
        user_id: r.requester_id,
        family_id: r.family_id,
        category: 'miscellaneous',
        custom_name: r.custom_name,
        points: r.points,
        notes: r.notes,
        photo_url: r.photo_url,
      });
      if (error) continue;
      await supabase.from('point_requests')
        .update({ status: 'approved', resolved_at: new Date().toISOString() })
        .eq('id', r.id);
      approved += 1;
    }

    if (announced === 0 && approved === 0 && declined === 0)
      return Response.json({ skipped: 'no requests to handle' });
    return Response.json({ job, announced, approved, declined });
  }

  // Settle the photo contest: 100 points to whoever had the most hearts
  // for the week whose voting closed yesterday. Ties all win. Runs
  // Wednesdays; photo_awards stops a week ever paying out twice.
  if (job === 'photo_award') {
    const week = addDays(now.date, -2); // Wednesday back to Monday
    const [{ data: entries }, { data: votes }, { data: done }] = await Promise.all([
      supabase.from('photo_entries')
        .select('id, family_id, profile_id, profiles!profile_id(username)').eq('week_start', week),
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
    const announce: { familyId: string; names: string[]; hearts: number }[] = [];
    for (const [familyId, familyEntries] of byFamily) {
      const top = Math.max(...familyEntries.map((e) => hearts.get(e.id) ?? 0));
      if (top === 0) continue; // nobody voted; nothing to award
      const winners = familyEntries.filter((e) => (hearts.get(e.id) ?? 0) === top);
      for (const e of winners) {
        rows.push({
          user_id: e.profile_id,
          family_id: familyId,
          category: 'weekly_photo',
          custom_name: 'Photo contest winner',
          points: 100,
          // Announced by name below, so keep it out of the points digest
          // rather than telling everyone twice.
          notified_at: new Date().toISOString(),
        });
      }
      marks.push({ family_id: familyId, week_start: week });
      announce.push({
        familyId,
        names: winners.map((e: any) => e.profiles?.username).filter(Boolean),
        hearts: top,
      });
    }
    if (rows.length === 0) return Response.json({ skipped: `nothing to settle for ${week}` });

    // Mark first: awarding twice is worse than not awarding, and the
    // points job will announce these on its next run either way.
    const { error: markErr } = await supabase.from('photo_awards').insert(marks);
    if (markErr) return Response.json({ error: markErr.message }, { status: 500 });
    const { error: ptsErr } = await supabase.from('point_submissions').insert(rows);
    if (ptsErr) return Response.json({ error: ptsErr.message }, { status: 500 });

    // Tell each family who won.
    let told = 0;
    for (const a of announce) {
      const audience = wants('photo').filter((r) => r.familyId === a.familyId);
      if (audience.length === 0 || a.names.length === 0) continue;
      const who = joinNames(a.names);
      const body = a.names.length > 1
        ? `${who} tied with ${a.hearts} ${a.hearts === 1 ? 'heart' : 'hearts'} each — 100 points apiece.`
        : `${who} won with ${a.hearts} ${a.hearts === 1 ? 'heart' : 'hearts'} — 100 points.`;
      const r = await pushEach(audience, () => ({ title: '📸 Photo contest winner', body }));
      told += r.sent;
    }

    return Response.json({ job, week, winners: rows.length, families: marks.length, told });
  }

  // Photo contest deadlines, at 5pm wherever each person is. Cron wakes this
  // every hour; each run notifies only the people for whom it is now 5pm on
  // the right day.
  if (job === 'photo_submit' || job === 'photo_vote') {
    const wantDay = job === 'photo_submit' ? 'Mon' : 'Tue';

    // Whose 5pm is it right now, and which contest week is that for them?
    // A week is named for the Monday photos are due, so Monday's reminder
    // is about today and Tuesday's vote reminder is about yesterday.
    const atFive = wants('photo')
      .map((r) => ({ r, local: localParts(r.timezone) }))
      .filter((x) => x.local.weekday === wantDay && x.local.hour === 17)
      .map((x) => ({
        r: x.r,
        week: job === 'photo_submit' ? x.local.date : addDays(x.local.date, -1),
      }));
    if (atFive.length === 0) return Response.json({ skipped: 'nobody at 5pm right now' });

    const weeks = [...new Set(atFive.map((x) => x.week))];

    // Nobody gets nagged about something they have already done.
    const [{ data: entries }, { data: cast }] = await Promise.all([
      supabase.from('photo_entries').select('profile_id, week_start').in('week_start', weeks),
      supabase.from('photo_votes').select('voter_id, week_start').in('week_start', weeks),
    ]);
    const done = new Set(
      job === 'photo_submit'
        ? (entries ?? []).map((e: any) => `${e.profile_id}|${e.week_start}`)
        : (cast ?? []).map((v: any) => `${v.voter_id}|${v.week_start}`),
    );

    const due = atFive.filter((x) => !done.has(`${x.r.id}|${x.week}`)).map((x) => x.r);
    if (due.length === 0) return Response.json({ skipped: 'everyone at 5pm has already done it' });

    const message: Message = job === 'photo_submit'
      ? { title: '📸 Submit your photo!', body: 'Reminder: the deadline to submit your photo is today.' }
      : { title: '🗳️ Vote!',              body: 'Reminder: the deadline to vote on a photo is today.' };

    const result = await pushEach(due, () => message);
    return Response.json({ job, reminded: due.length, alreadyDone: atFive.length - due.length, ...result });
  }

  return Response.json({ error: `unknown job: ${job}` }, { status: 400 });
});
