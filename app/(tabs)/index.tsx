import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar } from 'react-native-calendars';
import { StatusBar } from 'expo-status-bar';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import FamilyLogo from '@/components/FamilyLogo';
import ProfileButton from '@/components/ProfileButton';
import { supabase, PointSubmission } from '@/lib/supabase';

// ── Design tokens (matches clark-cup-v3.html) ──────────────────
const C = {
  bg:          '#f5f0e8',
  card:        '#ffffff',
  ink:         '#1c1a16',
  inkMid:      'rgba(28,26,22,0.5)',
  inkDim:      'rgba(28,26,22,0.3)',
  border:      'rgba(28,26,22,0.08)',
  borderMd:    'rgba(28,26,22,0.13)',
  accent:      '#d45f2e',
  accentBg:    'rgba(212,95,46,0.07)',
  green:       '#3a6b4a',
  greenBg:     'rgba(58,107,74,0.08)',
};

type UpcomingEvent = {
  id: string;
  event_date: string;                      // ISO date, start
  end_date: string | null;                 // ISO date, end of a range
  date_label: string;
  name: string;
  icon: string;
  profile_id: string | null;               // who it is for; null = the whole family
  created_by: string | null;               // who added it; only they can delete it
  profiles?: { username: string } | null;  // joined
};
type FamilyMember = { id: string; username: string; total_points: number };
// Shown once per launch of the app, not once per visit to this tab.
// Module scope rather than state, so navigating away and back does not
// bring it round again. A fresh launch -- or an over-the-air reload --
// reloads this module and clears it.
let standingShown = false;

function ordinalPlace(n: number) {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th'
    : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
  return `${n}${suffix} place`;
}
type PendingRequest = {
  id: string;
  requester_id: string;
  beneficiary_id: string;
  custom_name: string;
  points: number;
  options: number[] | null;
  created_at: string;
  profiles?: { username: string } | null;
  beneficiary?: { username: string } | null;
};
type ActivityItem  = PointSubmission & { profiles?: { username: string; avatar_url: string | null } };

// One row of the Activity Center. Everything the app would notify you
// about ends up here, from whichever table it actually lives in.
type FeedItem = {
  id: string;
  at: string;            // ISO, what the feed sorts on
  who: string;           // display name
  what: string;          // the second line
  points?: number;       // only points rows show a number on the right
};


const fmtLong  = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
const fmtShort = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// What the events list shows:
//   single day      → "June 15"
//   same month      → "July 4–6"
//   spanning months → "Jul 30 – Aug 2"
// Whole days from today to an ISO date, in local time
const daysFromToday = (iso: string) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round((new Date(y, m - 1, d).getTime() - today.getTime()) / 86400000);
};

// "in 7 days" / "tomorrow" / "today" / "happening now" for a range in progress
const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const formatEventDate = (start: Date, end: Date | null) => {
  if (!end || isSameDay(start, end)) return fmtLong(start);
  const sameMonth = start.getMonth() === end.getMonth()
    && start.getFullYear() === end.getFullYear();
  return sameMonth
    ? `${fmtLong(start)}–${end.getDate()}`
    : `${fmtShort(start)} – ${fmtShort(end)}`;
};

// "2026-06-15" in local time, for sorting (toISOString would shift the day)
const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const CHICAGO = 'America/Chicago';

// Highlight every day from start to end for the calendar's period marking.
function rangeMarks(start: Date, end: Date) {
  const marks: Record<string, any> = {};
  const day = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (day <= last) {
    const iso = toISODate(day);
    marks[iso] = {
      color: '#3a6b4a',
      textColor: '#fff',
      startingDay: iso === toISODate(start),
      endingDay: iso === toISODate(last),
    };
    day.setDate(day.getDate() + 1);
  }
  return marks;
}

// The date block on a "Coming up" row: a month over a day, or a day
// range when the event spans more than one.
function dateChip(ev: { event_date: string; end_date: string | null }) {
  const [y, m, d] = ev.event_date.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  const month = start.toLocaleDateString(undefined, { month: 'short' }).toUpperCase();
  if (!ev.end_date || ev.end_date === ev.event_date) return { month, days: `${d}` };
  const [ey, em, ed] = ev.end_date.split('-').map(Number);
  // A range crossing a month shows both months, so "NOV 28–DEC 2" does
  // not read as the 28th to the 2nd of November.
  if (em !== m || ey !== y) {
    const endMonth = new Date(ey, em - 1, ed)
      .toLocaleDateString(undefined, { month: 'short' }).toUpperCase();
    return { month: `${month}–${endMonth}`, days: `${d}–${ed}` };
  }
  return { month, days: `${d}–${ed}` };
}

// The pill on the right of a row. Only the first two earn a solid
// colour; anything further out is quieter.
function statusPill(ev: { event_date: string; end_date: string | null }) {
  const start = daysFromToday(ev.event_date);
  const end   = ev.end_date ? daysFromToday(ev.end_date) : start;
  if (start <= 0 && end >= 0) return { text: 'NOW', tone: 'now' as const };
  if (start === 0) return { text: 'TODAY', tone: 'soon' as const };
  if (start === 1) return { text: 'TOMORROW', tone: 'soon' as const };
  if (start > 1)   return { text: `IN ${start} DAYS`, tone: 'quiet' as const };
  return null;
}

// "in 3 days" for the next Sunday call, counted in Chicago so it matches
// when the call actually is.
function daysToSunday(): string {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: CHICAGO, weekday: 'short' })
    .format(new Date());
  const i = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(weekday);
  const until = (7 - i) % 7;
  return until === 0 ? 'today' : until === 1 ? 'tomorrow' : `in ${until} days`;
}

// The family call is 10am in Chicago. Everyone should see it in their own
// zone -- 10AM CST at home, 4PM BST in London -- so work out the actual
// instant of the next Sunday 10am Chicago, then let the device format it.
function familyCallLocal(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CHICAGO, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(get('weekday'));
  const untilSunday = (7 - days) % 7;

  const base = new Date(`${get('year')}-${get('month')}-${get('day')}T15:00:00Z`);
  base.setUTCDate(base.getUTCDate() + untilSunday);
  // 15:00Z is 9 or 10 in Chicago depending on daylight saving; nudge onto 10.
  const chicagoHour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: CHICAGO, hour: '2-digit', hour12: false,
  }).format(base));
  const instant = new Date(base.getTime() + (10 - chicagoHour) * 3600000);

  return instant
    .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
    .replace(':00', '');
}

const CATEGORY_LABELS: Record<string, string> = {
  sunday_call:  'Sunday Call',
  weekly_photo: 'Photo Contest',
  miscellaneous:'Miscellaneous',
};

export default function HomeScreen() {
  const router = useRouter();
  // The Coming Up tab sends people here to add an event, so that the
  // calendar and icon picker live in one place rather than two.
  const { addEvent } = useLocalSearchParams<{ addEvent?: string }>();
  const { profile, familyName } = useAuth();
  const [feed,             setFeed]             = useState<FeedItem[]>([]);
  // Snapshotted once per visit: the dots have to stay put while you read,
  // so we compare against where you were when you arrived, not against
  // the "seen" time we immediately write back.
  const [seenAt,           setSeenAt]           = useState<string | null>(null);
  const [seenSnapshotted,  setSeenSnapshotted]  = useState(false);
  const [refreshing,       setRefreshing]       = useState(false);
  const [events,           setEvents]           = useState<UpcomingEvent[]>([]);
  const [family,           setFamily]           = useState<FamilyMember[]>([]);
  const [pending,          setPending]          = useState<PendingRequest[]>([]);
  const [myVotes,          setMyVotes]          = useState<Record<string, boolean>>({});
  const [myChoice,         setMyChoice]         = useState<Record<string, number | null>>({});
  const [newEventFor,      setNewEventFor]      = useState<string | null>(null);
  const [addEventModal,    setAddEventModal]    = useState(false);
  const [standing,         setStanding]         = useState<{ place: number; tied: boolean; points: number; ahead: FamilyMember | null } | null>(null);
  const [dadsStuff,        setDadsStuff]        = useState(false);
  const [dadsCount,        setDadsCount]        = useState(0);
  const [showLater,        setShowLater]        = useState(false);
  const [newEventDate,     setNewEventDate]     = useState<Date>(new Date());
  const [newEventEnd,      setNewEventEnd]      = useState<Date>(new Date());
  // Tapping a day starts a new range; tapping a later day closes it.
  const [pickingEnd,       setPickingEnd]       = useState(false);
  const [newEventName,     setNewEventName]     = useState('');
  const [newEventIcon,     setNewEventIcon]     = useState('✈️');
  const [savingEvent,      setSavingEvent]      = useState(false);

  const fetchData = useCallback(async () => {
    const [
      { data: activity },
      { data: allProfiles },
      { data: eventsData, error: eventsError },
      { data: requests },
      { data: reqVotes },
      { data: photoEntries },
      { data: allRequests },
      { data: notified },
    ] = await Promise.all([
      supabase
        .from('point_submissions')
        .select('*, profiles(username, avatar_url)')
        .order('submitted_at', { ascending: false })
        .limit(10),
      supabase
        .from('profiles')
        .select('id, username, total_points')
        .order('total_points', { ascending: false }),
      supabase
        .from('upcoming_events')
        // Name the FK: profile_id and created_by both point at profiles,
        // so a bare profiles(username) embed is ambiguous and errors.
        // profile_id is who the event is for; created_by is who added it.
        // The feed needs the latter, so pull both under distinct aliases.
        .select('*, profiles!profile_id(username), creator:profiles!created_by(username)')
        .order('event_date', { ascending: true }),
      supabase
        .from('point_requests')
        // Two embeds onto profiles, so both need naming: who asked, and
        // who the points would go to. They are often the same person.
        .select('id, requester_id, beneficiary_id, custom_name, points, options, created_at, profiles!requester_id(username), beneficiary:profiles!beneficiary_id(username)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true }),
      supabase
        .from('point_request_votes')
        .select('request_id, approve, voter_id, choice'),
      supabase
        .from('photo_entries')
        .select('id, created_at, caption, profiles(username)')
        .order('created_at', { ascending: false })
        .limit(20),
      // Every request, not just the pending ones: the feed shows both the
      // asking and how it was settled.
      supabase
        .from('point_requests')
        .select('id, created_at, resolved_at, status, custom_name, points, options, requester_id, beneficiary_id, profiles!requester_id(username), beneficiary:profiles!beneficiary_id(username)')
        .order('created_at', { ascending: false })
        .limit(20),
      // The scheduled reminders, logged by the push function as it sends
      // them. Nothing else records these, so without this the Sunday call
      // and photo deadlines would be the only notifications missing here.
      supabase
        .from('activity_events')
        .select('id, created_at, title, body')
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    // Merge every source into one list, newest first. All of these are
    // already scoped to your family by row level security.
    const rows: FeedItem[] = [];

    for (const a of (activity ?? []) as ActivityItem[]) {
      rows.push({
        id: `pt-${a.id}`,
        at: a.submitted_at,
        who: a.profiles?.username ?? 'Someone',
        what: a.category === 'miscellaneous' && a.custom_name
          ? a.custom_name
          : CATEGORY_LABELS[a.category] ?? 'Points',
        points: a.points,
      });
    }

    for (const e of (eventsData ?? []) as any[]) {
      rows.push({
        id: `ev-${e.id}`,
        at: e.created_at,
        who: e.creator?.username ?? 'Someone',
        what: `added ${e.icon ?? ''} ${e.name}`.replace(/\s+/g, ' ').trim(),
      });
    }

    for (const ph of (photoEntries ?? []) as any[]) {
      rows.push({
        id: `ph-${ph.id}`,
        at: ph.created_at,
        who: ph.profiles?.username ?? 'Someone',
        what: ph.caption
          ? `entered the photo contest \u2014 ${ph.caption}`
          : 'entered the photo contest',
      });
    }

    for (const r of (allRequests ?? []) as any[]) {
      const who = r.profiles?.username ?? 'Someone';
      const forWhom = r.beneficiary?.username ?? who;
      const amount  = (r.options ?? []).length > 1
        ? (r.options as number[]).join('/')
        : `${r.points}`;
      rows.push({
        id: `rq-${r.id}`,
        at: r.created_at,
        who,
        what: r.beneficiary_id === r.requester_id
          ? `asked for ${amount} points for ${r.custom_name}`
          : `nominated ${forWhom} for ${amount} points — ${r.custom_name}`,
      });
      if (r.resolved_at && r.status !== 'pending') {
        rows.push({
          id: `rq-${r.id}-${r.status}`,
          at: r.resolved_at,
          who,
          what: r.status === 'approved'
            ? `request approved \u2014 ${r.custom_name}`
            : `request declined \u2014 ${r.custom_name}`,
        });
      }
    }

    for (const n of (notified ?? []) as any[]) {
      rows.push({ id: `nt-${n.id}`, at: n.created_at, who: n.title, what: n.body });
    }

    rows.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    setFeed(rows.slice(0, 20));
    // A failed query left the list empty and looked identical to "no events",
    // which made a broken schema look like lost data.
    if (eventsError) console.error('upcoming_events fetch failed:', eventsError.message);
    // Drop events that have already finished: a multi-day event stays until
    // its end_date passes, a single-day one until its own date does.
    if (eventsData) {
      const today = toISODate(new Date());
      setEvents((eventsData as UpcomingEvent[]).filter(
        (e) => (e.end_date ?? e.event_date) >= today,
      ));
    }

    if (allProfiles) {
      setFamily(allProfiles as FamilyMember[]);
    }
    if (requests) setPending(requests as unknown as PendingRequest[]);
    if (reqVotes && profile) {
      const mine: Record<string, boolean> = {};
      const picks: Record<string, number | null> = {};
      for (const v of reqVotes as any[]) {
        if (v.voter_id !== profile.id) continue;
        mine[v.request_id] = v.approve;
        picks[v.request_id] = v.choice ?? null;
      }
      setMyVotes(mine);
      setMyChoice(picks);
    }
  }, [profile]);

  // A temporary section, switched on per family, so it can be turned
  // off again without shipping anything.
  useEffect(() => {
    if (!profile?.family_id) return;
    (async () => {
      const [{ data: fam }, { count }] = await Promise.all([
        supabase.from('families').select('dads_stuff').eq('id', profile.family_id).single(),
        supabase.from('dads_stuff_items').select('id', { count: 'exact', head: true }),
      ]);
      setDadsStuff(!!(fam as any)?.dads_stuff);
      setDadsCount(count ?? 0);
    })();
  }, [profile?.family_id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (addEvent === '1') {
      setNewEventFor(defaultEventFor());
      setAddEventModal(true);
      router.setParams({ addEvent: undefined } as never);
    }
  }, [addEvent]);

  // Where you stand, the moment the family's points have loaded.
  useEffect(() => {
    if (standingShown || !profile || family.length === 0) return;
    const sorted = [...family].sort((a, b) => b.total_points - a.total_points);
    const me = sorted.find((m) => m.id === profile.id);
    if (!me) return;
    // Standard competition ranking, so a tie is a shared place rather
    // than an arbitrary order.
    const place = sorted.findIndex((m) => m.total_points === me.total_points) + 1;
    const tied  = sorted.filter((m) => m.total_points === me.total_points).length > 1;
    // The nearest person actually ahead on points, not merely listed above.
    const ahead = [...sorted].reverse().find((m) => m.total_points > me.total_points) ?? null;
    standingShown = true;
    setStanding({ place, tied, points: me.total_points, ahead });
  }, [profile, family]);

  // Take the read mark once per visit and immediately move it to now. The
  // dots are drawn against the snapshot, so they stay put while you read
  // and are gone the next time you come back.
  useEffect(() => {
    if (!profile || seenSnapshotted) return;
    setSeenAt((profile as any).activity_seen_at ?? null);
    setSeenSnapshotted(true);
    supabase
      .from('profiles')
      .update({ activity_seen_at: new Date().toISOString() })
      .eq('id', profile.id)
      .then(({ error }) => {
        if (error) console.error('activity seen update failed:', error.message);
      });
  }, [profile, seenSnapshotted]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  // Preselect the signed-in member, unless they are not one of the five
  // (a test account), in which case start on Everyone.
  const defaultEventFor = () => profile?.id ?? null;

  const handleAddEvent = async () => {
    if (!newEventName.trim()) {
      Alert.alert('Missing info', 'Please enter an event name.');
      return;
    }
    setSavingEvent(true);
    const { error } = await supabase.from('upcoming_events').insert({
      event_date: toISODate(newEventDate),
      end_date:   isSameDay(newEventDate, newEventEnd) ? null : toISODate(newEventEnd),
      date_label: formatEventDate(newEventDate, newEventEnd),
      profile_id: newEventFor,
      family_id:  profile?.family_id,
      created_by: profile?.id ?? null,
      name:       newEventName.trim(),
      icon:       newEventIcon || '✈️',
    });
    setSavingEvent(false);
    if (error) { Alert.alert('Error', 'Could not save event.'); return; }
    setAddEventModal(false);
    setNewEventDate(new Date());
    setNewEventEnd(new Date());
    setPickingEnd(false);
    setNewEventName('');
    setNewEventIcon('✈️');
    setNewEventFor(defaultEventFor());
    fetchData();
  };

  // Votes are recorded now and tallied by the server at the 48 hour mark,
  // so nothing is awarded here.
  // choice is the amount picked on a poll, and null on a plain yes/no
  // or on any decline.
  const voteOnRequest = async (id: string, approve: boolean, choice?: number) => {
    if (!profile) return;
    const { error } = await supabase
      .from('point_request_votes')
      .insert({ request_id: id, voter_id: profile.id, approve, choice: choice ?? null });
    if (error) { Alert.alert('Error', 'Could not record that vote.'); return; }
    setMyVotes((m) => ({ ...m, [id]: approve }));
    setMyChoice((m) => ({ ...m, [id]: choice ?? null }));
  };

  const hoursLeft = (createdAt: string) =>
    Math.max(0, 48 - Math.floor((Date.now() - new Date(createdAt).getTime()) / 3600000));

  // "Coming up" means the next month, plus anything already under way.
  // A rolling 30 days rather than the calendar month, so the section
  // does not shrink to nothing on the 29th.
  const WINDOW = 30;
  const soon  = events.filter((ev) => daysFromToday(ev.event_date) <= WINDOW);
  const later = events.filter((ev) => daysFromToday(ev.event_date) > WINDOW);
  const shownEvents = showLater ? events : soon;

  const handleDeleteEvent = (ev: UpcomingEvent) => {
    Alert.alert(
      'Delete event?',
      `"${ev.name}" will be removed for everyone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('upcoming_events').delete().eq('id', ev.id);
            if (error) { Alert.alert('Error', 'Could not delete that event.'); return; }
            fetchData();
          },
        },
      ],
    );
  };


  // Whoever is actually in this family. RLS already limits the query to
  // them, so no name list is needed -- and a hardcoded one would leave
  // every family but the Clarks with an empty picker.
  const familyChips = family;

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── HEADER ─────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.logoRow}>
              <FamilyLogo size={44} />
              <View style={{ flex: 1 }}>
                <Text style={styles.greetingSmall} numberOfLines={1}>
                  Welcome back, {profile?.username?.trim().split(/\s+/)[0] || '—'}
                </Text>
                <Text style={styles.familyTitle} numberOfLines={1}>{familyName ?? 'Family Cup'}</Text>
              </View>
            </View>
            <ProfileButton />
          </View>
        </View>

        {/* ── COMING UP ──────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionLabelRow}>
            <Text style={styles.sectionLabel}>Coming up</Text>
            <TouchableOpacity style={styles.addBtn} onPress={() => { setNewEventFor(defaultEventFor()); setAddEventModal(true); }}>
              <Text style={styles.addBtnText}>+ Add</Text>
              <View style={styles.addPts}><Text style={styles.addPtsText}>+10</Text></View>
            </TouchableOpacity>
          </View>

          {shownEvents.length === 0 ? (
            <View style={styles.eventsEmpty}>
              <Text style={styles.emptyText}>
                {later.length > 0 ? 'Nothing in the next month.' : 'Nothing coming up — tap + Add!'}
              </Text>
            </View>
          ) : (
            <View style={styles.card}>
              {shownEvents.map((ev, i) => {
                const chip = dateChip(ev);
                const pill = statusPill(ev);
                const mine = profile?.id && ev.created_by === profile.id;
                return (
                  <TouchableOpacity
                    key={ev.id}
                    style={[styles.evRow, i < shownEvents.length - 1 && styles.rowBorder]}
                    activeOpacity={0.7}
                    onPress={() => router.push(`/event/${ev.id}` as never)}>
                    <View style={styles.evChip}>
                      <Text style={styles.evChipMonth}>{chip.month}</Text>
                      <Text style={styles.evChipDays}>{chip.days}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.evName} numberOfLines={2}>{ev.name}</Text>
                      <Text style={styles.evFor} numberOfLines={1}>
                        {ev.profiles?.username ?? 'Everyone'}
                      </Text>
                    </View>
                    {pill && (
                      <View style={[
                        styles.evPill,
                        pill.tone === 'now'  && styles.evPillNow,
                        pill.tone === 'soon' && styles.evPillSoon,
                      ]}>
                        <Text style={[
                          styles.evPillText,
                          pill.tone === 'now' && styles.evPillTextNow,
                        ]}>{pill.text}</Text>
                      </View>
                    )}
                    {mine && (
                      <TouchableOpacity
                        onPress={() => handleDeleteEvent(ev)}
                        hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                        accessibilityLabel={`Delete ${ev.name}`}>
                        <Text style={styles.evDelete}>✕</Text>
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {later.length > 0 && (
            <TouchableOpacity
              style={styles.evMore}
              onPress={() => setShowLater((v) => !v)}
              activeOpacity={0.7}>
              <Text style={styles.evMoreText}>
                {showLater
                  ? 'Show less'
                  : `See ${later.length} more later on`}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── EARN THIS WEEK ─────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Earn this week</Text>
          <View style={styles.card}>
            <View style={[styles.earnRow, styles.rowBorder]}>
              <View style={styles.earnIcon}><Text style={styles.earnEmoji}>📞</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.earnName}>Sunday Call</Text>
                <Text style={styles.earnWhen}>Sun, {familyCallLocal()} · {daysToSunday()}</Text>
              </View>
              <View style={styles.earnPts}><Text style={styles.earnPtsText}>+50</Text></View>
            </View>

            <View style={styles.earnRow}>
              <View style={styles.earnIcon}><Text style={styles.earnEmoji}>📸</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.earnName}>Photo Contest</Text>
                <Text style={styles.earnWhen}>Due Monday, end of day</Text>
              </View>
              <View style={styles.earnPts}><Text style={styles.earnPtsText}>+100</Text></View>
            </View>

            <TouchableOpacity
              style={styles.earnCta}
              activeOpacity={0.85}
              onPress={() => router.push('/photo-contest')}>
              <Text style={styles.earnCtaText}>Submit your photo</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── PENDING POINTS ─────────────────────────────── */}
        {pending.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Pending Points</Text>
            <View style={styles.pendingCard}>
              {pending.map((req, i) => {
                const voted   = myVotes[req.id];
                const picked  = myChoice[req.id];
                const asker   = req.profiles?.username ?? 'Someone';
                const forWhom = req.beneficiary?.username ?? asker;
                // Nobody votes on points they would receive. Asking on
                // someone else's behalf still leaves you a vote.
                const isForMe = req.beneficiary_id === profile?.id;
                const options = req.options ?? [];
                const isPoll  = options.length > 1;
                // "Kelly · +50" when it is their own, "Kari → Kelly" when
                // one of them nominated the other.
                // A poll keeps its amounts out of the heading: they are on
                // the buttons directly below, so repeating them only costs
                // the names room and truncates them.
                const amount  = isPoll ? options.join('/') : `${req.points}`;
                const heading = req.beneficiary_id === req.requester_id
                  ? `${asker} wants ${amount} pts`
                  : `${asker} nominated ${forWhom} for ${amount} pts`;
                const left    = hoursLeft(req.created_at);
                // Once the buttons are gone -- you voted, or it is your own
                // windfall -- the amounts have nowhere else to show.
                const showButtons = !isForMe && voted === undefined;
                const amountsTail = isPoll && !showButtons ? ` · ${options.join('/')}` : '';
                return (
                  <View key={req.id} style={[styles.pendingRow, i < pending.length - 1 && styles.pendingBorder]}>
                    <View style={styles.pendAvatar}>
                      <Text style={styles.pendAvatarText}>{asker.slice(0, 1).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1, paddingRight: 10 }}>
                      <Text style={styles.pendingName} numberOfLines={2}>{heading}</Text>
                      <Text style={styles.pendingWhat} numberOfLines={2}>For: {req.custom_name}</Text>
                      {(isForMe || voted !== undefined) && (
                        <Text style={styles.pendVerdict}>
                          {isForMe
                            ? 'For you'
                            : voted
                              ? (picked != null ? `✓ You picked ${picked}` : '✓ You approved')
                              : '✕ You declined'}
                        </Text>
                      )}

                      {/* How much of the 48 hours is left, at a glance. */}
                      <View style={styles.pendTrack}>
                        <View style={[styles.pendFill, { width: `${Math.round((left / 48) * 100)}%` }]} />
                      </View>
                      <Text style={styles.pendingClock}>
                        Voting closes in {left}h{amountsTail}
                      </Text>
                      {/* A poll puts its amounts on their own line: three
                          buttons and a Decline will not fit beside the text. */}
                      {isPoll && showButtons && (
                        <View style={styles.pollRow}>
                          {options.map((o) => (
                            <TouchableOpacity
                              key={o}
                              style={styles.pollBtn}
                              onPress={() => voteOnRequest(req.id, true, o)}>
                              <Text style={styles.pollBtnText}>{o}</Text>
                            </TouchableOpacity>
                          ))}
                          <TouchableOpacity style={styles.declineBtn} onPress={() => voteOnRequest(req.id, false)}>
                            <Text style={styles.declineText}>Decline</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                    {!isPoll && showButtons && (
                      <View style={styles.pendingBtns}>
                        <TouchableOpacity style={styles.declineBtn} onPress={() => voteOnRequest(req.id, false)}>
                          <Text style={styles.declineText}>Decline</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.approveBtn} onPress={() => voteOnRequest(req.id, true)}>
                          <Text style={styles.approveText}>Approve</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* ── DAD'S STUFF (temporary) ─────────────────────── */}
        {dadsStuff && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.dadsCard}
              onPress={() => router.push('/dads-stuff' as never)}
              activeOpacity={0.85}>
              <View style={{ flex: 1 }}>
                <Text style={styles.dadsTitle}>Dad's Stuff</Text>
                <Text style={styles.dadsSub}>
                  {dadsCount === 0
                    ? 'Photos of things to go through'
                    : `${dadsCount} ${dadsCount === 1 ? 'thing' : 'things'} — say what you'd like to keep`}
                </Text>
              </View>
              <Text style={styles.dadsChev}>›</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── ACTIVITY CENTER ──────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Activity Center</Text>
          <View style={styles.eventsCard}>
            {feed.length === 0 && (
              <View style={styles.eventItem}>
                <Text style={styles.emptyText}>Nothing yet — be the first to score!</Text>
              </View>
            )}
            {feed.map((item, i) => {
              const unread = !!seenAt && item.at > seenAt;
              return (
                <View key={item.id} style={[styles.ptItem, i < feed.length - 1 && styles.eventBorder]}>
                  {/* Always the same width, dot or no dot, so rows line up */}
                  <View style={styles.ptDotSlot}>{unread && <View style={styles.ptDotNew} />}</View>
                  <View style={styles.ptInfo}>
                    <Text style={styles.ptName} numberOfLines={1}>{item.who}</Text>
                    <Text style={styles.ptReason} numberOfLines={2}>{item.what}</Text>
                  </View>
                  <View style={styles.ptRight}>
                    {item.points !== undefined && <Text style={styles.ptVal}>+{item.points}</Text>}
                    <Text style={styles.ptDate}>{formatDate(item.at)}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

      </ScrollView>

      {/* ── Where you stand ─────────────────────────────── */}
      <Modal visible={!!standing} animationType="fade" transparent onRequestClose={() => setStanding(null)}>
        <View style={styles.standBackdrop}>
          <View style={styles.standCard}>
            <Text style={styles.standCrest}>
              {standing?.place === 1 ? '🏆' : standing?.place === 2 ? '🥈' : standing?.place === 3 ? '🥉' : '⏳'}
            </Text>
            <Text style={styles.standPlace}>
              {standing ? `${standing.tied ? 'Joint ' : ''}${ordinalPlace(standing.place)}` : ''}
            </Text>
            <Text style={styles.standPoints}>
              {standing ? `${standing.points.toLocaleString()} points` : ''}
            </Text>
            <Text style={styles.standLine}>
              {!standing ? '' : standing.place === 1 && !standing.tied
                ? 'You hold the Cup. Mind it closely.'
                : standing.ahead
                  ? `${standing.ahead.username} is ${(standing.ahead.total_points - standing.points).toLocaleString()} ahead.`
                  : 'Level at the top — for now.'}
            </Text>
            <TouchableOpacity style={styles.standBtn} onPress={() => setStanding(null)} activeOpacity={0.85}>
              <Text style={styles.standBtnText}>Onward</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Add Event Modal ─────────────────────────────── */}
      <Modal visible={addEventModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAddEventModal(false)}>
        <KeyboardAvoidingView style={styles.modalContainer} behavior={Platform.OS === 'ios' ? undefined : 'height'}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => { setAddEventModal(false); setNewEventDate(new Date()); setNewEventEnd(new Date()); setPickingEnd(false); setNewEventName(''); setNewEventIcon('✈️'); setNewEventFor(defaultEventFor()); }}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Add Event</Text>
            <TouchableOpacity onPress={handleAddEvent} disabled={savingEvent}>
              <Text style={[styles.modalSave, savingEvent && { opacity: 0.4 }]}>Save</Text>
            </TouchableOpacity>
          </View>
          <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            <Text style={styles.formLabel}>Dates</Text>
            <Calendar
              current={toISODate(newEventDate)}
              markingType="period"
              markedDates={rangeMarks(newEventDate, newEventEnd)}
              onDayPress={(day: any) => {
                const [y, m, d] = day.dateString.split('-').map(Number);
                const picked = new Date(y, m - 1, d);
                if (!pickingEnd) {
                  // First tap: start a fresh single-day range.
                  setNewEventDate(picked);
                  setNewEventEnd(picked);
                  setPickingEnd(true);
                } else if (picked < newEventDate) {
                  // Tapped before the start: treat it as a new start.
                  setNewEventDate(picked);
                  setNewEventEnd(picked);
                } else {
                  setNewEventEnd(picked);
                  setPickingEnd(false);
                }
              }}
              theme={{
                calendarBackground: C.card,
                textSectionTitleColor: C.inkMid,
                monthTextColor: C.ink,
                dayTextColor: C.ink,
                textDisabledColor: C.inkDim,
                arrowColor: C.ink,
                todayTextColor: C.accent,
                textMonthFontWeight: '700',
                textDayFontSize: 15,
                textMonthFontSize: 16,
              }}
              style={styles.calendar}
            />
            <Text style={styles.datePreview}>
              {pickingEnd
                ? 'Tap the last day, or save for a single day'
                : isSameDay(newEventDate, newEventEnd)
                  ? `Single day \u2014 shows as \u201c${formatEventDate(newEventDate, newEventEnd)}\u201d`
                  : `Shows as \u201c${formatEventDate(newEventDate, newEventEnd)}\u201d`}
            </Text>

            <Text style={styles.formLabel}>Who is it for?</Text>
            <View style={styles.chipRow}>
              {familyChips.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.chip, newEventFor === m.id && styles.chipOn]}
                  onPress={() => setNewEventFor(m.id)}>
                  <Text style={[styles.chipText, newEventFor === m.id && styles.chipTextOn]}>{m.username}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.chip, newEventFor === null && styles.chipOn]}
                onPress={() => setNewEventFor(null)}>
                <Text style={[styles.chipText, newEventFor === null && styles.chipTextOn]}>Everyone</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.formLabel}>Event Name</Text>
            <TextInput style={styles.input} value={newEventName} onChangeText={setNewEventName}
              placeholder="e.g. Traveling to..." placeholderTextColor={C.inkDim} />
            <Text style={styles.formLabel}>Icon (emoji)</Text>
            <TextInput style={styles.input} value={newEventIcon} onChangeText={setNewEventIcon}
              placeholder="✈️" placeholderTextColor={C.inkDim} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scroll:    { paddingBottom: 40 },

  // Header
  header:       { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 4, backgroundColor: C.bg },
  headerTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  logoRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  logoIcon:     { width: 44, height: 44, backgroundColor: C.ink, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  logoEmoji:    { fontSize: 22 },
  logoText:     { fontSize: 15, fontWeight: '600', color: C.ink, letterSpacing: -0.2 },
  headerRight:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerYear:   { fontSize: 13, fontWeight: '500', color: C.inkMid },
  yearPill:     { backgroundColor: 'rgba(28,26,22,0.06)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  familyTitle:  { fontSize: 22, fontWeight: '700', color: C.ink, letterSpacing: -0.4 },
  greetingSmall:{ fontSize: 13, fontWeight: '500', color: C.inkMid, marginBottom: 2 },
  // lineHeight must be >= fontSize or iOS clips the tops of tall letters
  greetingName: { fontSize: 64, fontWeight: '400', lineHeight: 72, letterSpacing: -2, color: C.ink, fontStyle: 'italic', marginBottom: 4 },

  // Rank pill shadowOpacity: 0.06, shadowRadius: 12, elevation: 3, marginTop: 18 },

  // Progress shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 }, shadowOpacity: 0.4, shadowRadius: 4 },

  // Sections
  section:         { paddingHorizontal: 20, paddingTop: 20 },
  sectionLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionLabel:    { fontSize: 11, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: C.inkDim, marginBottom: 10 },

  addBtn:     { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: C.card, borderWidth: 1, borderColor: C.borderMd, paddingLeft: 16, paddingRight: 8, paddingVertical: 8, borderRadius: 99, justifyContent: 'center' },
  addBtnText: { color: C.ink, fontSize: 14, fontWeight: '600', letterSpacing: -0.1 },
  addPts:     { backgroundColor: 'rgba(58,107,74,0.12)', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  addPtsText: { color: C.green, fontSize: 12, fontWeight: '800' },

  // Reminder cards
  // Events card
  eventsCard:  { backgroundColor: C.card, borderRadius: 22, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  eventBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(28,26,22,0.07)' },
  eventItem:   { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingVertical: 15 },

  // Upcoming: horizontally scrolling cards
  pendingCard:   { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  pendingRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14 },
  pendAvatar:    { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(28,26,22,0.06)', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  pendAvatarText:{ fontSize: 14, fontWeight: '800', color: C.inkMid },
  pendVerdict:   { fontSize: 12, fontWeight: '700', color: C.green, marginTop: 5 },
  pendTrack:     { height: 5, borderRadius: 3, backgroundColor: 'rgba(28,26,22,0.07)', marginTop: 10, overflow: 'hidden' },
  pendFill:      { height: 5, borderRadius: 3, backgroundColor: '#c98a3c' },
  pendingBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  pendingName:   { fontSize: 15, fontWeight: '700', color: C.ink },
  pendingWhat:   { fontSize: 13, color: C.inkMid, marginTop: 1 },
  pendingClock:  { fontSize: 11, color: C.inkDim, marginTop: 6 },
  pendingBtns:   { flexDirection: 'row', gap: 8 },
  declineBtn:    { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: C.borderMd },
  declineText:   { fontSize: 13, fontWeight: '600', color: C.inkMid },
  dadsCard:      { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 20, paddingVertical: 18, paddingHorizontal: 20, borderLeftWidth: 4, borderLeftColor: C.green },
  dadsTitle:     { fontSize: 18, fontWeight: '700', color: C.ink },
  dadsSub:       { fontSize: 13, color: C.inkMid, marginTop: 3 },
  // A plain white panel that rows sit inside.
  card:          { backgroundColor: C.card, borderRadius: 20, overflow: 'hidden' },
  rowBorder:     { borderBottomWidth: 1, borderBottomColor: 'rgba(28,26,22,0.07)' },

  // Coming up
  evRow:         { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 16 },
  evChip:        { width: 46, paddingVertical: 6, borderRadius: 10, backgroundColor: '#efe7d8', alignItems: 'center' },
  evChipMonth:   { fontSize: 8, fontWeight: '800', color: C.inkMid, letterSpacing: 0.5 },
  evChipDays:    { fontSize: 13, fontWeight: '800', color: C.ink, marginTop: 1 },
  evName:        { fontSize: 15, fontWeight: '700', color: C.ink },
  evFor:         { fontSize: 13, color: C.inkMid, marginTop: 2 },
  evPill:        { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 11, backgroundColor: 'rgba(28,26,22,0.05)' },
  evPillNow:     { backgroundColor: C.green },
  evPillSoon:    { backgroundColor: 'rgba(58,107,74,0.12)' },
  evPillText:    { fontSize: 10, fontWeight: '800', color: C.inkMid, letterSpacing: 0.5 },
  evPillTextNow: { color: '#fff' },
  evDelete:      { fontSize: 13, color: C.inkDim, paddingLeft: 2 },
  evMore:        { alignSelf: 'center', paddingVertical: 9, paddingHorizontal: 16, marginTop: 8 },
  evMoreText:    { fontSize: 13, fontWeight: '700', color: C.green },

  // Earn this week
  earnRow:       { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 16 },
  earnIcon:      { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(58,107,74,0.10)', alignItems: 'center', justifyContent: 'center' },
  earnEmoji:     { fontSize: 19 },
  earnName:      { fontSize: 15, fontWeight: '700', color: C.ink },
  earnWhen:      { fontSize: 13, color: C.inkMid, marginTop: 2 },
  earnPts:       { paddingVertical: 5, paddingHorizontal: 11, borderRadius: 11, backgroundColor: 'rgba(28,26,22,0.05)' },
  earnPtsText:   { fontSize: 13, fontWeight: '800', color: C.inkMid },
  earnCta:       { backgroundColor: C.green, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginHorizontal: 16, marginBottom: 16, marginTop: 2 },
  earnCtaText:   { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Memories
  dadsChev:      { fontSize: 26, color: C.inkDim, marginLeft: 10 },
  standBackdrop: { flex: 1, backgroundColor: 'rgba(20,18,15,0.55)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 },
  standCard:     { width: '100%', backgroundColor: C.card, borderRadius: 26, paddingVertical: 30, paddingHorizontal: 26, alignItems: 'center' },
  standCrest:    { fontSize: 44, marginBottom: 10 },
  standPlace:    { fontSize: 30, fontWeight: '400', fontStyle: 'italic', letterSpacing: -0.8, color: C.ink, textAlign: 'center' },
  standPoints:   { fontSize: 15, fontWeight: '600', color: C.green, marginTop: 4 },
  standLine:     { fontSize: 14, lineHeight: 20, color: C.inkMid, textAlign: 'center', marginTop: 12 },
  standBtn:      { marginTop: 22, alignSelf: 'stretch', backgroundColor: C.ink, borderRadius: 999, paddingVertical: 15, alignItems: 'center' },
  standBtnText:  { color: '#fff', fontSize: 15, fontWeight: '700' },
  pollRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  pollBtn:       { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: C.green },
  pollBtnText:   { fontSize: 13, fontWeight: '700', color: '#fff' },
  approveBtn:    { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: C.green },
  approveText:   { fontSize: 13, fontWeight: '600', color: '#fff' },
  eventsEmpty: { backgroundColor: C.card, borderRadius: 18, paddingVertical: 22, alignItems: 'center' },
  emptyText:   { flex: 1, fontSize: 13, color: C.inkMid, textAlign: 'center', paddingVertical: 4 },

  // Recent points
  ptItem:   { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingVertical: 15 },
  ptDotSlot:{ width: 10, alignItems: 'center', flexShrink: 0 },
  ptDotNew: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.accent },
  ptInfo:   { flex: 1 },
  ptName:   { fontSize: 14, fontWeight: '600', color: C.ink },
  ptReason: { fontSize: 12, color: C.inkMid, marginTop: 2, fontStyle: 'italic' },
  ptRight:  { alignItems: 'flex-end' },
  ptVal:    { fontSize: 20, color: C.green, letterSpacing: -0.5, fontStyle: 'italic', fontWeight: '400' },
  ptDate:   { fontSize: 10, color: C.inkDim, fontWeight: '500', marginTop: 1 },

  // Modal
  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(28,26,22,0.08)' },
  modalCancel:    { fontSize: 16, color: C.inkMid },
  modalTitle:     { fontSize: 17, fontWeight: '700', color: C.ink },
  modalSave:      { fontSize: 16, fontWeight: '700', color: C.accent },
  modalScroll:    { padding: 20, paddingBottom: 40 },
  formLabel:      { fontSize: 11, fontWeight: '600', color: C.inkDim, marginBottom: 8, marginTop: 20, textTransform: 'uppercase', letterSpacing: 0.8 },
  input:          { backgroundColor: '#f5f0e8', borderRadius: 12, padding: 14, fontSize: 16, color: C.ink, borderWidth: 1, borderColor: 'rgba(28,26,22,0.1)' },
  calendar:       { borderRadius: 16, overflow: 'hidden', marginBottom: 4 },
  dateValue:      { fontSize: 16, color: C.ink },
  datePreview:    { fontSize: 13, color: C.inkMid, marginTop: 8, fontStyle: 'italic' },
  chipRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 2 },
  chip:           { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: '#f5f0e8', borderWidth: 1, borderColor: 'rgba(28,26,22,0.1)' },
  chipOn:         { backgroundColor: C.green, borderColor: C.green },
  chipText:       { fontSize: 14, fontWeight: '500', color: C.ink },
  chipTextOn:     { color: '#ffffff' },
});
