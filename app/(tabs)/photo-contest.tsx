import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

const C = {
  bg:       '#f5f0e8',
  card:     '#ffffff',
  ink:      '#1c1a16',
  inkMid:   'rgba(28,26,22,0.5)',
  inkDim:   'rgba(28,26,22,0.3)',
  border:   'rgba(28,26,22,0.08)',
  borderMd: 'rgba(28,26,22,0.13)',
  accent:   '#d45f2e',
  green:    '#3a6b4a',
  greenBg:  'rgba(58,107,74,0.08)',
};

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = Math.min(260, SCREEN_W * 0.62);

type Entry = {
  id: string;
  profile_id: string;
  week_start: string;
  photo_url: string;
  caption: string | null;
  profiles?: { username: string } | null;
};
type Vote = { entry_id: string; voter_id: string; profiles?: { username: string } | null };

// A contest week is named for the Monday its submissions are due, so the
// live week is the upcoming Monday (or today, if today is Monday). Voting
// then runs through the Tuesday after.
function contestWeek(d: Date): string {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const ahead = (8 - copy.getDay()) % 7; // Mon = 0 days ahead
  copy.setDate(copy.getDate() + ahead);
  return `${copy.getFullYear()}-${String(copy.getMonth() + 1).padStart(2, '0')}-${String(copy.getDate()).padStart(2, '0')}`;
}

function weekLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `Week of ${new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;
}

// Submissions are due Monday (the day the week is named for) and voting
// closes at the end of Tuesday, so a week is open for hearts through
// week_start + 1 day.
function votingOpen(weekStart: string): boolean {
  const [y, m, d] = weekStart.split('-').map(Number);
  const closes = new Date(y, m - 1, d + 1, 23, 59, 59, 999);
  return new Date() <= closes;
}

export default function PhotoContestScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const [entries, setEntries]   = useState<Entry[]>([]);
  const [votes, setVotes]       = useState<Vote[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefresh]= useState(false);
  const [uploading, setUploading] = useState(false);

  const thisWeek = contestWeek(new Date());

  const fetchData = useCallback(async () => {
    const [{ data: e }, { data: v }] = await Promise.all([
      supabase
        .from('photo_entries')
        .select('id, profile_id, week_start, photo_url, caption, profiles(username)')
        .eq('hidden', false)
        .order('week_start', { ascending: false })
        .order('created_at', { ascending: true }),
      supabase
        .from('photo_votes')
        .select('entry_id, voter_id, profiles!voter_id(username)'),
    ]);
    if (e) setEntries(e as unknown as Entry[]);
    if (v) setVotes(v as unknown as Vote[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = async () => { setRefresh(true); await fetchData(); setRefresh(false); };

  // ── Uploading your photo ────────────────────────────────────────
  const addPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow photo access.'); return; }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [4, 3], quality: 0.7,
    });
    if (picked.canceled) return;

    // Optional one-liner. Cancel skips the photo entirely; Skip posts it bare.
    const caption = await new Promise<string | null>((resolve) => {
      Alert.prompt(
        'Add a description?',
        'Optional — a few words about this photo.',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
          { text: 'Skip', onPress: () => resolve('') },
          { text: 'Add', onPress: (text?: string) => resolve((text ?? '').trim()) },
        ],
        'plain-text',
        '',
      );
    });
    if (caption === null) return;

    setUploading(true);
    try {
      const uri = picked.assets[0].uri;
      const ext = uri.split('.').pop() ?? 'jpg';
      const path = `contest/${profile!.id}-${thisWeek}.${ext}`;
      const bytes = await (await fetch(uri)).arrayBuffer();
      const { error: upErr } = await supabase.storage
        .from('photos').upload(path, bytes, { contentType: `image/${ext}`, upsert: true });
      if (upErr) throw upErr;
      const url = supabase.storage.from('photos').getPublicUrl(path).data.publicUrl;

      const { error } = await supabase.from('photo_entries').insert({
        family_id: profile!.family_id,
        profile_id: profile!.id,
        week_start: thisWeek,
        photo_url: url,
        caption: caption || null,
      });
      if (error) throw error;
      await fetchData();
    } catch (err: any) {
      const already = String(err?.message ?? '').includes('one_entry_per_week');
      Alert.alert(
        already ? 'Already entered' : 'Could not upload',
        already
          ? 'You have already submitted a photo this week.'
          : 'Something went wrong uploading that photo.',
      );
    } finally {
      setUploading(false);
    }
  };

  // ── Your own photo ──────────────────────────────────────────────
  const removeMine = (entry: Entry) => {
    Alert.alert('Remove your photo?', 'It will be taken out of this week\u2019s contest.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('photo_entries').delete().eq('id', entry.id);
          if (error) { Alert.alert('Error', 'Could not remove that photo.'); return; }
          await fetchData();
        },
      },
    ]);
  };

  // ── Reporting ───────────────────────────────────────────────────
  // Reporting hides the photo for everyone immediately (a database trigger
  // sets hidden), so nothing objectionable stays up waiting on review.
  const report = (entry: Entry) => {
    Alert.alert(
      'Report this photo?',
      'It will be hidden from everyone straight away and sent to the app owner for review.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('photo_reports').insert({
              entry_id: entry.id,
              reporter_id: profile!.id,
              family_id: profile!.family_id,
            });
            if (error) { Alert.alert('Error', 'Could not report that photo.'); return; }
            await fetchData();
            Alert.alert('Reported', 'Thanks — it has been hidden and flagged for review.');
          },
        },
      ],
    );
  };

  // ── Hearting ────────────────────────────────────────────────────
  // One heart per person per week: tapping another photo moves it.
  const toggleVote = async (entry: Entry) => {
    if (!profile) return;
    if (!votingOpen(entry.week_start)) {
      Alert.alert('Voting closed', 'Hearts for that week closed at the end of Tuesday.');
      return;
    }
    const mine = votes.find((v) => v.voter_id === profile.id && entryWeek(v) === entry.week_start);

    if (mine?.entry_id === entry.id) {
      await supabase.from('photo_votes').delete()
        .eq('voter_id', profile.id).eq('week_start', entry.week_start);
    } else if (mine) {
      await supabase.from('photo_votes').update({ entry_id: entry.id })
        .eq('voter_id', profile.id).eq('week_start', entry.week_start);
    } else {
      await supabase.from('photo_votes').insert({
        family_id: profile.family_id,
        week_start: entry.week_start,
        entry_id: entry.id,
        voter_id: profile.id,
      });
    }
    await fetchData();
  };

  const entryWeek = (v: Vote) => entries.find((e) => e.id === v.entry_id)?.week_start;
  const votersFor = (entryId: string) =>
    votes.filter((v) => v.entry_id === entryId).map((v) => v.profiles?.username).filter(Boolean) as string[];

  // ── Group by week, newest first ─────────────────────────────────
  const weeks = [...new Set([thisWeek, ...entries.map((e) => e.week_start)])]
    .sort((a, b) => (a < b ? 1 : -1));

  const iEnteredThisWeek = entries.some(
    (e) => e.week_start === thisWeek && e.profile_id === profile?.id,
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>Photo Contest</Text>
        <View style={{ width: 54 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.inkDim} />}
      >
        <Text style={styles.rules}>
          Submit your photo by EOD Monday, then vote by EOD Tuesday.
        </Text>

        {loading && <ActivityIndicator style={{ marginTop: 32 }} color={C.green} />}

        {!loading && weeks.map((week) => {
          const weekEntries = entries.filter((e) => e.week_start === week);
          const counts = weekEntries.map((e) => votersFor(e.id).length);
          const most   = Math.max(0, ...counts);
          const open   = votingOpen(week);
          const mine   = weekEntries.some((e) => e.profile_id === profile?.id);

          return (
            <View key={week} style={styles.weekBlock}>
              <View style={styles.weekHeader}>
                <Text style={styles.weekTitle}>{weekLabel(week)}</Text>
                {open ? (
                  <View style={styles.thisWeekPill}><Text style={styles.thisWeekText}>THIS WEEK</Text></View>
                ) : (
                  <Text style={styles.closedText}>Voting closed</Text>
                )}
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.row}
                snapToInterval={CARD_W + 12}
                decelerationRate="fast"
              >
                {/* Only while you still owe a photo for an open week. */}
                {open && !mine && (
                  <TouchableOpacity style={styles.addCard} onPress={addPhoto} disabled={uploading} activeOpacity={0.8}>
                    <View style={styles.addCircle}>
                      {uploading
                        ? <ActivityIndicator color={C.ink} />
                        : <Text style={styles.addPlus}>+</Text>}
                    </View>
                    <Text style={styles.addLabel}>{uploading ? 'Adding…' : 'Add your photo'}</Text>
                  </TouchableOpacity>
                )}

                {weekEntries.map((entry) => {
                  const count   = votersFor(entry.id).length;
                  const iVoted  = votes.some((v) => v.entry_id === entry.id && v.voter_id === profile?.id);
                  const won     = !open && most > 0 && count === most;
                  return (
                    <View key={entry.id} style={styles.card}>
                      <View>
                        <Image source={{ uri: entry.photo_url }} style={styles.photo} resizeMode="cover" />
                        <TouchableOpacity
                          style={styles.photoAction}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          onPress={() => (entry.profile_id === profile?.id ? removeMine(entry) : report(entry))}
                          accessibilityLabel={entry.profile_id === profile?.id ? 'Remove your photo' : 'Report this photo'}>
                          <Text style={styles.photoActionText}>
                            {entry.profile_id === profile?.id ? '✕' : '⚑'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.cardFooter}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.cardName} numberOfLines={1}>
                            {entry.profiles?.username ?? 'Someone'}
                          </Text>
                          {!!entry.caption && (
                            <Text style={styles.cardCaption} numberOfLines={2}>{entry.caption}</Text>
                          )}
                          <Text style={[styles.cardMeta, won && styles.cardMetaWin]} numberOfLines={1}>
                            {won
                              ? 'Winner · +100 pts'
                              : count === 0
                                ? (open ? 'No votes yet' : 'No votes')
                                : `${count} ${count === 1 ? 'vote' : 'votes'}`}
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => toggleVote(entry)}
                          disabled={!open}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          style={styles.voteWrap}
                          accessibilityLabel={iVoted ? 'Remove your vote' : 'Vote for this photo'}>
                          {count > 0 && <Text style={styles.voteCount}>{count}</Text>}
                          <Text style={[styles.heart, !open && !won && { opacity: 0.3 }]}>
                            {iVoted || won ? '❤️' : '🤍'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}

                {weekEntries.length === 0 && !open && (
                  <View style={styles.emptyCard}><Text style={styles.emptyText}>No photos that week.</Text></View>
                )}
              </ScrollView>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
  },
  back:     { fontSize: 16, color: C.accent, fontWeight: '600' },
  navTitle: { fontSize: 17, fontWeight: '700', color: C.ink },
  scroll:   { paddingBottom: 40 },

  rules: { fontSize: 14, color: C.inkMid, lineHeight: 20, paddingHorizontal: 20, marginBottom: 24 },

  weekBlock:  { marginBottom: 28 },
  weekHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, marginBottom: 12,
  },
  weekTitle:  { fontSize: 20, fontWeight: '700', color: C.ink, letterSpacing: -0.4 },
  thisWeekPill: { backgroundColor: C.greenBg, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  thisWeekText: { fontSize: 11, fontWeight: '700', color: C.green, letterSpacing: 0.6 },
  closedText:   { fontSize: 13, color: C.inkMid },

  row: { paddingHorizontal: 20, gap: 12 },

  addCard: {
    width: CARD_W, aspectRatio: 0.82, borderRadius: 18,
    backgroundColor: 'rgba(28,26,22,0.06)',
    alignItems: 'center', justifyContent: 'center', gap: 14,
  },
  addCircle: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: C.card,
    alignItems: 'center', justifyContent: 'center',
  },
  addPlus:  { fontSize: 26, color: C.ink, marginTop: -2 },
  addLabel: { fontSize: 14, fontWeight: '500', color: C.ink },

  card: {
    width: CARD_W, borderRadius: 18, overflow: 'hidden', backgroundColor: C.card,
  },
  photoAction: {
    position: 'absolute', top: 8, right: 8,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center',
  },
  photoActionText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  photo:      { width: '100%', aspectRatio: 1, backgroundColor: '#e8e2d8' },
  cardFooter: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 8 },
  cardName:   { fontSize: 15, fontWeight: '700', color: C.ink },
  cardCaption:{ fontSize: 13, color: C.ink, marginTop: 2 },
  cardMeta:   { fontSize: 13, color: C.inkMid, marginTop: 2 },
  cardMetaWin:{ color: C.green, fontWeight: '600' },
  voteWrap:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  voteCount:  { fontSize: 14, fontWeight: '700', color: C.accent },
  heart:      { fontSize: 20 },

  emptyCard: {
    width: CARD_W, aspectRatio: 0.82, borderRadius: 18, backgroundColor: C.card,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border,
  },
  emptyText: { fontSize: 13, color: C.inkMid },
});
