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
import DateTimePicker from '@react-native-community/datetimepicker';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '@/context/AuthContext';
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
type ActivityItem  = PointSubmission & { profiles?: { username: string; avatar_url: string | null } };

const AVATAR_COLORS = ['#d45f2e','#3a6b4a','#7a6abf','#c4743a','#5a7abf','#b45a7a'];

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
const countdownLabel = (ev: { event_date: string; end_date: string | null }) => {
  const start = daysFromToday(ev.event_date);
  const end   = ev.end_date ? daysFromToday(ev.end_date) : start;
  if (start > 1)  return `in ${start} days`;
  if (start === 1) return 'tomorrow';
  if (start === 0) return 'today';
  return end >= 0 ? 'happening now' : '';
};

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
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

const CARD_W = 232;

const CATEGORY_LABELS: Record<string, string> = {
  sunday_call:  'Sunday Call',
  weekly_photo: 'Photo Contest',
  miscellaneous:'Miscellaneous',
};

export default function HomeScreen() {
  const { profile } = useAuth();
  const [recentActivity,   setRecentActivity]   = useState<ActivityItem[]>([]);
  const [refreshing,       setRefreshing]       = useState(false);
  const [events,           setEvents]           = useState<UpcomingEvent[]>([]);
  const [family,           setFamily]           = useState<FamilyMember[]>([]);
  const [newEventFor,      setNewEventFor]      = useState<string | null>(null);
  const [addEventModal,    setAddEventModal]    = useState(false);
  const [newEventDate,     setNewEventDate]     = useState<Date>(new Date());
  const [newEventEnd,      setNewEventEnd]      = useState<Date>(new Date());
  const [showDatePicker,   setShowDatePicker]   = useState(false);
  const [showEndPicker,    setShowEndPicker]    = useState(false);
  const [newEventName,     setNewEventName]     = useState('');
  const [newEventIcon,     setNewEventIcon]     = useState('✈️');
  const [savingEvent,      setSavingEvent]      = useState(false);

  const fetchData = useCallback(async () => {
    const [{ data: activity }, { data: allProfiles }, { data: eventsData, error: eventsError }] = await Promise.all([
      supabase
        .from('point_submissions')
        .select('*, profiles(username, avatar_url)')
        .order('submitted_at', { ascending: false })
        .limit(3),
      supabase
        .from('profiles')
        .select('id, username, total_points')
        .order('total_points', { ascending: false }),
      supabase
        .from('upcoming_events')
        // Name the FK: profile_id and created_by both point at profiles,
        // so a bare profiles(username) embed is ambiguous and errors.
        .select('*, profiles!profile_id(username)')
        .order('event_date', { ascending: true }),
    ]);

    if (activity)    setRecentActivity(activity as ActivityItem[]);
    // A failed query left the list empty and looked identical to "no events",
    // which made a broken schema look like lost data.
    if (eventsError) console.error('upcoming_events fetch failed:', eventsError.message);
    if (eventsData)  setEvents(eventsData as UpcomingEvent[]);

    if (allProfiles) {
      setFamily(allProfiles as FamilyMember[]);
    }
  }, [profile]);

  useEffect(() => { fetchData(); }, [fetchData]);

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
    setShowDatePicker(false);
    setShowEndPicker(false);
    setNewEventName('');
    setNewEventIcon('✈️');
    setNewEventFor(defaultEventFor());
    fetchData();
  };

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
              <View style={styles.logoIcon}><Text style={styles.logoEmoji}>🏆</Text></View>
              <Text style={styles.logoText}>Family Cup</Text>
            </View>
            <Text style={styles.headerYear}>2026</Text>
          </View>

          <Text style={styles.greetingSmall}>Welcome back</Text>
          <Text style={styles.greetingName}>{profile?.username ?? '—'}.</Text>
        </View>

        {/* ── UPCOMING ───────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionLabelRow}>
            <Text style={styles.sectionLabel}>Upcoming</Text>
            <TouchableOpacity style={styles.addBtn} onPress={() => { setNewEventFor(defaultEventFor()); setAddEventModal(true); }}>
              <Text style={styles.addBtnText}>+ Add</Text>
            </TouchableOpacity>
          </View>

          {events.length === 0 ? (
            <View style={styles.eventsEmpty}>
              <Text style={styles.emptyText}>No upcoming events — tap + Add!</Text>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.eventScroll}
              decelerationRate="fast"
              snapToInterval={CARD_W + 12}
              snapToAlignment="start"
            >
              {events.map((ev) => {
                const countdown = countdownLabel(ev);
                return (
                  <View key={ev.id} style={styles.eventCard}>
                    <View style={styles.ecTop}>
                      <Text style={styles.ecIcon}>{ev.icon}</Text>
                      {profile?.id && ev.created_by === profile.id && (
                        <TouchableOpacity
                          onPress={() => handleDeleteEvent(ev)}
                          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                          accessibilityLabel={`Delete ${ev.name}`}>
                          <Text style={styles.ecDelete}>✕</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <View style={styles.ecDateRow}>
                      <Text style={styles.ecDate}>{ev.date_label}</Text>
                      {countdown !== '' && <Text style={styles.ecCountdown}>{countdown}</Text>}
                    </View>
                    <Text style={styles.ecName} numberOfLines={2}>{ev.name}</Text>
                    <Text style={styles.ecFor}>
                      {ev.profiles?.username ? `For ${ev.profiles.username}` : 'Everyone'}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>

        {/* ── REMINDERS ──────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Weekly Reminders</Text>
          <View style={styles.remindersRow}>
            <View style={styles.reminderCard}>
              <View style={styles.rTop}>
                <Text style={styles.rEmoji}>📞</Text>
                <View style={styles.rPtsBadge}><Text style={styles.rPtsText}>+50 pts</Text></View>
              </View>
              <Text style={styles.rName}>Sunday Call</Text>
              <Text style={styles.rFreq}>Every Sunday</Text>
            </View>
            <View style={styles.reminderCard}>
              <View style={styles.rTop}>
                <Text style={styles.rEmoji}>📸</Text>
                <View style={styles.rPtsBadge}><Text style={styles.rPtsText}>+100 pts</Text></View>
              </View>
              <Text style={styles.rName}>Photo Contest</Text>
              <Text style={styles.rFreq}>Every week</Text>
            </View>
          </View>
        </View>

        {/* ── RECENT POINTS ──────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Recent Points</Text>
          <View style={styles.eventsCard}>
            {recentActivity.length === 0 && (
              <View style={styles.eventItem}>
                <Text style={styles.emptyText}>No activity yet — be the first to score!</Text>
              </View>
            )}
            {recentActivity.map((item, i) => {
              const name  = item.profiles?.username ?? 'Someone';
              const label = item.category === 'miscellaneous' && item.custom_name
                ? item.custom_name
                : CATEGORY_LABELS[item.category];
              return (
                <View key={item.id} style={[styles.ptItem, i < recentActivity.length - 1 && styles.eventBorder]}>
                  <View style={[styles.ptDot, { backgroundColor: avatarColor(name) }]} />
                  <View style={styles.ptInfo}>
                    <Text style={styles.ptName}>{name}</Text>
                    <Text style={styles.ptReason}>{label}</Text>
                  </View>
                  <View style={styles.ptRight}>
                    <Text style={styles.ptVal}>+{item.points}</Text>
                    <Text style={styles.ptDate}>{formatDate(item.submitted_at)}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

      </ScrollView>

      {/* ── Add Event Modal ─────────────────────────────── */}
      <Modal visible={addEventModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAddEventModal(false)}>
        <KeyboardAvoidingView style={styles.modalContainer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => { setAddEventModal(false); setNewEventDate(new Date()); setNewEventEnd(new Date()); setShowDatePicker(false); setShowEndPicker(false); setNewEventName(''); setNewEventIcon('✈️'); setNewEventFor(defaultEventFor()); }}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Add Event</Text>
            <TouchableOpacity onPress={handleAddEvent} disabled={savingEvent}>
              <Text style={[styles.modalSave, savingEvent && { opacity: 0.4 }]}>Save</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            <Text style={styles.formLabel}>Starts</Text>
            <TouchableOpacity style={styles.input} onPress={() => { setShowDatePicker(v => !v); setShowEndPicker(false); }}>
              <Text style={styles.dateValue}>{fmtLong(newEventDate)}</Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={newEventDate}
                mode="date"
                display="inline"
                onChange={(_, picked) => {
                  if (Platform.OS !== 'ios') setShowDatePicker(false);
                  if (!picked) return;
                  setNewEventDate(picked);
                  // drag the end along rather than leaving an impossible range
                  if (picked > newEventEnd) setNewEventEnd(picked);
                }}
              />
            )}

            <Text style={styles.formLabel}>Ends</Text>
            <TouchableOpacity style={styles.input} onPress={() => { setShowEndPicker(v => !v); setShowDatePicker(false); }}>
              <Text style={styles.dateValue}>{fmtLong(newEventEnd)}</Text>
            </TouchableOpacity>
            {showEndPicker && (
              <DateTimePicker
                value={newEventEnd}
                mode="date"
                display="inline"
                minimumDate={newEventDate}
                onChange={(_, picked) => {
                  if (Platform.OS !== 'ios') setShowEndPicker(false);
                  if (picked) setNewEventEnd(picked);
                }}
              />
            )}
            <Text style={styles.datePreview}>
              {isSameDay(newEventDate, newEventEnd)
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
  header:       { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 28, backgroundColor: C.bg },
  headerTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 },
  logoRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoIcon:     { width: 30, height: 30, backgroundColor: C.ink, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  logoEmoji:    { fontSize: 15 },
  logoText:     { fontSize: 15, fontWeight: '600', color: C.ink, letterSpacing: -0.2 },
  headerYear:   { fontSize: 13, fontWeight: '500', color: C.inkMid },
  greetingSmall:{ fontSize: 13, fontWeight: '500', color: C.inkMid, marginBottom: 2 },
  // lineHeight must be >= fontSize or iOS clips the tops of tall letters
  greetingName: { fontSize: 64, fontWeight: '400', lineHeight: 72, letterSpacing: -2, color: C.ink, fontStyle: 'italic', marginBottom: 4 },

  // Rank pill shadowOpacity: 0.06, shadowRadius: 12, elevation: 3, marginTop: 18 },

  // Progress shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 }, shadowOpacity: 0.4, shadowRadius: 4 },

  // Sections
  section:         { paddingHorizontal: 20, paddingTop: 20 },
  sectionLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionLabel:    { fontSize: 11, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: C.inkDim, marginBottom: 10 },

  addBtn:     { backgroundColor: C.ink, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 99, minHeight: 44, justifyContent: 'center' },
  addBtnText: { color: '#fff', fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },

  // Reminder cards
  remindersRow: { flexDirection: 'row', gap: 10 },
  reminderCard: { flex: 1, backgroundColor: C.card, borderRadius: 22, padding: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  rTop:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  rEmoji:       { fontSize: 28, lineHeight: 32 },
  rPtsBadge:    { backgroundColor: C.greenBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  rPtsText:     { fontSize: 11, fontWeight: '600', color: C.green },
  rName:        { fontSize: 15, fontWeight: '600', color: C.ink, marginBottom: 3 },
  rFreq:        { fontSize: 11, color: C.inkDim, fontWeight: '500' },

  // Events card
  eventsCard:  { backgroundColor: C.card, borderRadius: 22, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  eventBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(28,26,22,0.07)' },
  eventItem:   { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingVertical: 15 },

  // Upcoming: horizontally scrolling cards
  eventScroll: { gap: 12, paddingRight: 20, paddingVertical: 2 },
  eventsEmpty: { backgroundColor: C.card, borderRadius: 18, paddingVertical: 22, alignItems: 'center' },
  eventCard:   { width: CARD_W, backgroundColor: C.card, borderRadius: 18, padding: 16 },
  ecTop:       { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 },
  ecIcon:      { fontSize: 24 },
  ecDelete:    { fontSize: 14, color: C.inkDim, fontWeight: '500' },
  ecDateRow:   { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 4 },
  ecDate:      { fontSize: 13, color: C.inkMid, fontStyle: 'italic' },
  ecCountdown: { fontSize: 13, color: C.ink, fontWeight: '500' },
  ecName:      { fontSize: 16, fontWeight: '600', color: C.ink, lineHeight: 21, marginBottom: 4 },
  ecFor:       { fontSize: 13, color: C.inkMid },
  emptyText:   { flex: 1, fontSize: 13, color: C.inkMid, textAlign: 'center', paddingVertical: 4 },

  // Recent points
  ptItem:   { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingVertical: 15 },
  ptDot:    { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
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
  dateValue:      { fontSize: 16, color: C.ink },
  datePreview:    { fontSize: 13, color: C.inkMid, marginTop: 8, fontStyle: 'italic' },
  chipRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 2 },
  chip:           { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: '#f5f0e8', borderWidth: 1, borderColor: 'rgba(28,26,22,0.1)' },
  chipOn:         { backgroundColor: C.green, borderColor: C.green },
  chipText:       { fontSize: 14, fontWeight: '500', color: C.ink },
  chipTextOn:     { color: '#ffffff' },
});
