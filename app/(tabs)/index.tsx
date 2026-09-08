import React, { useEffect, useState, useCallback, useRef } from 'react';
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
  Animated,
  Dimensions,
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

type UpcomingEvent = { id: string; date_label: string; name: string; icon: string };
type ActivityItem  = PointSubmission & { profiles?: { username: string; avatar_url: string | null } };

const AVATAR_COLORS = ['#d45f2e','#3a6b4a','#7a6abf','#c4743a','#5a7abf','#b45a7a'];

// "June 15" — what the events list shows
const formatEventDate = (d: Date) =>
  d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

// "2026-06-15" in local time, for sorting (toISOString would shift the day)
const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function parseDate(label: string): { month: string; day: string; isRange: boolean } {
  const parts = label.trim().split(' ');
  const month = parts[0]?.slice(0, 3) ?? '';
  const day   = parts.slice(1).join(' ');
  return { month, day, isRange: day.includes('–') || day.includes('-') };
}

function isHot(label: string): boolean {
  try {
    const now   = new Date();
    const parts = label.trim().split(' ');
    const month = parts[0];
    const day   = parseInt(parts[1]?.split('–')[0] ?? '1', 10);
    const year  = now.getFullYear();
    const d     = new Date(`${month} ${day}, ${year}`);
    return (d.getTime() - now.getTime()) < 30 * 24 * 60 * 60 * 1000;
  } catch { return false; }
}

const CATEGORY_LABELS: Record<string, string> = {
  sunday_call:  'Sunday Call',
  weekly_photo: 'Photo Contest',
  miscellaneous:'Miscellaneous',
};

const { width: SCREEN_W } = Dimensions.get('window');
const BAR_W = SCREEN_W - 40 - 40; // screen - horizontal padding - card padding

export default function HomeScreen() {
  const { profile } = useAuth();
  const [recentActivity,   setRecentActivity]   = useState<ActivityItem[]>([]);
  const [rank,             setRank]             = useState<number | null>(null);
  const [firstPlacePts,    setFirstPlacePts]    = useState(0);
  const [refreshing,       setRefreshing]       = useState(false);
  const [events,           setEvents]           = useState<UpcomingEvent[]>([]);
  const [addEventModal,    setAddEventModal]    = useState(false);
  const [newEventDate,     setNewEventDate]     = useState<Date>(new Date());
  const [showDatePicker,   setShowDatePicker]   = useState(false);
  const [newEventName,     setNewEventName]     = useState('');
  const [newEventIcon,     setNewEventIcon]     = useState('📅');
  const [savingEvent,      setSavingEvent]      = useState(false);

  const barAnim = useRef(new Animated.Value(0)).current;

  const fetchData = useCallback(async () => {
    const [{ data: activity }, { data: allProfiles }, { data: eventsData }] = await Promise.all([
      supabase
        .from('point_submissions')
        .select('*, profiles(username, avatar_url)')
        .order('submitted_at', { ascending: false })
        .limit(3),
      supabase
        .from('profiles')
        .select('id, total_points')
        .order('total_points', { ascending: false }),
      supabase
        .from('upcoming_events')
        .select('*')
        .order('event_date', { ascending: true }),
    ]);

    if (activity)    setRecentActivity(activity as ActivityItem[]);
    if (eventsData)  setEvents(eventsData as UpcomingEvent[]);

    if (allProfiles) {
      setFirstPlacePts(allProfiles[0]?.total_points ?? 0);
      if (profile) {
        const idx = allProfiles.findIndex((p) => p.id === profile.id);
        setRank(idx >= 0 ? idx + 1 : null);
      }
    }
  }, [profile]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Animate progress bar whenever points/firstPlace change
  useEffect(() => {
    const myPts = profile?.total_points ?? 0;
    const pct   = firstPlacePts > 0 ? Math.min(myPts / firstPlacePts, 1) : 0;
    barAnim.setValue(0);
    Animated.timing(barAnim, {
      toValue: pct,
      duration: 1000,
      useNativeDriver: false,
    }).start();
  }, [profile?.total_points, firstPlacePts]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const handleAddEvent = async () => {
    if (!newEventName.trim()) {
      Alert.alert('Missing info', 'Please enter an event name.');
      return;
    }
    setSavingEvent(true);
    const { error } = await supabase.from('upcoming_events').insert({
      event_date: toISODate(newEventDate),
      date_label: formatEventDate(newEventDate),
      name:       newEventName.trim(),
      icon:       newEventIcon || '📅',
    });
    setSavingEvent(false);
    if (error) { Alert.alert('Error', 'Could not save event.'); return; }
    setAddEventModal(false);
    setNewEventDate(new Date());
    setShowDatePicker(false);
    setNewEventName('');
    setNewEventIcon('📅');
    fetchData();
  };

  const getRankLabel = (r: number) => {
    if (r === 1) return { emoji: '🥇', label: '1st place' };
    if (r === 2) return { emoji: '🥈', label: '2nd place' };
    if (r === 3) return { emoji: '🥉', label: '3rd place' };
    return { emoji: '🏅', label: `${r}th place` };
  };

  const myPts    = profile?.total_points ?? 0;
  const gapToFirst = Math.max(firstPlacePts - myPts, 0);
  const rankInfo = rank !== null ? getRankLabel(rank) : null;

  const barWidth = barAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: ['0%', '100%'],
  });

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

          {rankInfo && (
            <View style={styles.rankPill}>
              <Text style={styles.rankMedal}>{rankInfo.emoji}</Text>
              <Text style={styles.rankLabel}>{rankInfo.label}</Text>
              <View style={styles.rankSep} />
              <Text style={styles.rankPts}>{myPts.toLocaleString()}</Text>
              <Text style={styles.rankPtsLabel}> pts</Text>
            </View>
          )}
        </View>

        {/* ── PROGRESS BAR ───────────────────────────────── */}
        {rank !== null && rank > 1 && (
          <View style={styles.progressWrap}>
            <View style={styles.progressCard}>
              <Text style={styles.progressText}>{gapToFirst.toLocaleString()} pts from 1st place</Text>
              <View style={styles.track}>
                <Animated.View style={[styles.fill, { width: barWidth }]}>
                  <View style={styles.fillDot} />
                </Animated.View>
              </View>
            </View>
          </View>
        )}

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

        {/* ── UPCOMING ───────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionLabelRow}>
            <Text style={styles.sectionLabel}>Upcoming</Text>
            <TouchableOpacity style={styles.addBtn} onPress={() => setAddEventModal(true)}>
              <Text style={styles.addBtnText}>+ Add</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.eventsCard}>
            {events.map((ev, i) => {
              const { month, day, isRange } = parseDate(ev.date_label);
              const hot = isHot(ev.date_label);
              return (
                <View key={ev.id} style={[styles.eventItem, i < events.length - 1 && styles.eventBorder]}>
                  <View style={styles.eDateCol}>
                    <Text style={styles.eMonth}>{month}</Text>
                    <Text style={[styles.eDay, isRange && styles.eDaySmall]}>{day}</Text>
                  </View>
                  <View style={[styles.ePip, hot && styles.ePipHot]} />
                  <Text style={styles.eName}>{ev.name}</Text>
                  <Text style={styles.eIcon}>{ev.icon}</Text>
                </View>
              );
            })}
            {events.length === 0 && (
              <View style={styles.eventItem}>
                <Text style={styles.emptyText}>No upcoming events — tap + Add!</Text>
              </View>
            )}
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
            <TouchableOpacity onPress={() => { setAddEventModal(false); setNewEventDate(new Date()); setShowDatePicker(false); setNewEventName(''); setNewEventIcon('📅'); }}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Add Event</Text>
            <TouchableOpacity onPress={handleAddEvent} disabled={savingEvent}>
              <Text style={[styles.modalSave, savingEvent && { opacity: 0.4 }]}>Save</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            <Text style={styles.formLabel}>Date</Text>
            <TouchableOpacity style={styles.input} onPress={() => setShowDatePicker(v => !v)}>
              <Text style={styles.dateValue}>{formatEventDate(newEventDate)}</Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={newEventDate}
                mode="date"
                display="inline"
                onChange={(_, picked) => {
                  if (Platform.OS !== 'ios') setShowDatePicker(false);
                  if (picked) setNewEventDate(picked);
                }}
              />
            )}
            <Text style={styles.formLabel}>Event Name</Text>
            <TextInput style={styles.input} value={newEventName} onChangeText={setNewEventName}
              placeholder="e.g. Kyle's Birthday!" placeholderTextColor={C.inkDim} />
            <Text style={styles.formLabel}>Icon (emoji)</Text>
            <TextInput style={styles.input} value={newEventIcon} onChangeText={setNewEventIcon}
              placeholder="📅" placeholderTextColor={C.inkDim} />
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
  greetingName: { fontSize: 64, fontWeight: '400', lineHeight: 58, letterSpacing: -2, color: C.ink, fontStyle: 'italic', marginBottom: 8 },

  // Rank pill
  rankPill:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.card, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 12, alignSelf: 'flex-start', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3, marginTop: 18 },
  rankMedal:    { fontSize: 18 },
  rankLabel:    { fontSize: 14, fontWeight: '600', color: C.ink },
  rankSep:      { width: 1, height: 16, backgroundColor: C.borderMd, marginHorizontal: 4 },
  rankPts:      { fontSize: 18, color: C.ink, letterSpacing: -0.5, fontStyle: 'italic' },
  rankPtsLabel: { fontSize: 12, color: C.inkMid, fontWeight: '500' },

  // Progress
  progressWrap: { paddingHorizontal: 20, marginTop: 4, marginBottom: 4 },
  progressCard: { backgroundColor: C.card, borderRadius: 22, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  progressText: { fontSize: 12, fontWeight: '500', color: C.inkMid, marginBottom: 12 },
  track:        { height: 6, backgroundColor: 'rgba(28,26,22,0.07)', borderRadius: 99, overflow: 'visible', position: 'relative' },
  fill:         { height: '100%', backgroundColor: C.accent, borderRadius: 99, position: 'relative' },
  fillDot:      { position: 'absolute', right: -8, top: -5, width: 16, height: 16, backgroundColor: C.accent, borderWidth: 3, borderColor: C.card, borderRadius: 8, shadowColor: C.accent, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 4 },

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
  eDateCol:    { width: 42, flexShrink: 0 },
  eMonth:      { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, color: C.inkDim, lineHeight: 13 },
  eDay:        { fontSize: 26, lineHeight: 28, letterSpacing: -0.5, color: C.ink, fontStyle: 'italic' },
  eDaySmall:   { fontSize: 17, lineHeight: 22 },
  ePip:        { width: 7, height: 7, borderRadius: 4, backgroundColor: C.borderMd, flexShrink: 0 },
  ePipHot:     { backgroundColor: C.accent },
  eName:       { flex: 1, fontSize: 14, fontWeight: '500', color: C.ink, lineHeight: 19 },
  eIcon:       { fontSize: 20, opacity: 0.85 },
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
});
