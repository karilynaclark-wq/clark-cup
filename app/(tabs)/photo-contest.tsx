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
const PHOTO_W = SCREEN_W - 40;

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
          One photo each per week, in by Monday. Heart your favourite by Tuesday —
          the most hearts wins 100 points. Ties all win.
        </Text>

        {loading && <ActivityIndicator style={{ marginTop: 32 }} color={C.green} />}

        {!loading && weeks.map((week) => {
          const weekEntries = entries.filter((e) => e.week_start === week);
          const counts = weekEntries.map((e) => votersFor(e.id).length);
          const most = Math.max(0, ...counts);
          const open = votingOpen(week);

          return (
            <View key={week} style={styles.weekBlock}>
              <View style={styles.weekHeader}>
                <View>
                  <Text style={styles.weekTitle}>{weekLabel(week)}</Text>
                  {!open && most > 0 && (
                    <Text style={styles.weekClosed}>
                      Voting closed · {counts.filter((c) => c === most).length > 1 ? 'tied winners' : 'winner'} below
                    </Text>
                  )}
                </View>
                {week === thisWeek && !iEnteredThisWeek && (
                  <TouchableOpacity style={styles.addBtn} onPress={addPhoto} disabled={uploading}>
                    <Text style={styles.addBtnText}>{uploading ? 'Adding…' : '+ Add yours'}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {weekEntries.length === 0 && (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>
                    {week === thisWeek ? 'No photos yet this week — be first!' : 'No photos that week.'}
                  </Text>
                </View>
              )}

              {weekEntries.map((entry) => {
                const voters  = votersFor(entry.id);
                const iVoted  = votes.some((v) => v.entry_id === entry.id && v.voter_id === profile?.id);
                const winning = most > 0 && voters.length === most;
                return (
                  <View key={entry.id} style={[styles.photoCard, winning && styles.photoCardWin]}>
                    <Image source={{ uri: entry.photo_url }} style={styles.photo} resizeMode="cover" />
                    <View style={styles.photoFooter}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.photoBy}>{entry.profiles?.username ?? 'Someone'}</Text>
                        <Text style={styles.voters} numberOfLines={2}>
                          {voters.length === 0
                            ? 'No hearts yet'
                            : `${voters.length} · ${voters.join(', ')}`}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => toggleVote(entry)}
                        disabled={!open}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        accessibilityLabel={iVoted ? 'Remove your heart' : 'Heart this photo'}>
                        <Text style={[styles.heart, !open && { opacity: 0.35 }]}>{iVoted ? '❤️' : '🤍'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
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
  navTitle: { fontSize: 16, fontWeight: '700', color: C.ink },
  scroll:   { padding: 20, paddingBottom: 48 },

  rules: { fontSize: 13, color: C.inkMid, lineHeight: 19, marginBottom: 20 },

  weekBlock:  { marginBottom: 28 },
  weekHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  weekClosed: { fontSize: 12, color: C.inkMid, marginTop: 2 },
  weekTitle:  { fontSize: 18, fontWeight: '700', color: C.ink, letterSpacing: -0.3 },
  addBtn:     { backgroundColor: C.card, borderWidth: 1, borderColor: C.borderMd, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  addBtnText: { fontSize: 13, fontWeight: '600', color: C.ink },

  emptyCard: { backgroundColor: C.card, borderRadius: 16, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  emptyText: { fontSize: 13, color: C.inkMid },

  photoCard:    { backgroundColor: C.card, borderRadius: 18, overflow: 'hidden', marginBottom: 14, borderWidth: 1, borderColor: C.border },
  photoCardWin: { borderColor: C.green, borderWidth: 2 },
  photo:        { width: '100%', height: PHOTO_W * 0.7, backgroundColor: '#e8e2d8' },
  photoFooter:  { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  photoBy:      { fontSize: 15, fontWeight: '600', color: C.ink },
  voters:       { fontSize: 12, color: C.inkMid, marginTop: 2 },
  heart:        { fontSize: 26 },
});
