import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert,
  ActivityIndicator, RefreshControl, Dimensions, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

const C = {
  bg:       '#f5f0e8',
  card:     '#ffffff',
  ink:      '#1c1a16',
  inkMid:   'rgba(28,26,22,0.5)',
  inkDim:   'rgba(28,26,22,0.3)',
  border:   'rgba(28,26,22,0.08)',
  accent:   '#d45f2e',
  green:    '#3a6b4a',
  greenBg:  'rgba(58,107,74,0.08)',
};

const { width: SCREEN_W } = Dimensions.get('window');
const TILE = (SCREEN_W - 20 * 2 - 10) / 2;

type Choice = 'claim' | 'save' | 'pass';
const CHOICES: { key: Choice; label: string; short: string }[] = [
  { key: 'claim', label: 'Claim',        short: 'claimed'  },
  { key: 'save',  label: "Save at Mom's", short: "save at Mom's" },
  { key: 'pass',  label: "Don't want",   short: 'passed'   },
];

type Item = {
  id: string;
  media_url: string;
  kind: 'image' | 'video';
  caption: string | null;
  created_at: string;
};
type Vote = { item_id: string; profile_id: string; choice: Choice };

export default function DadsStuffScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const [items, setItems]       = useState<Item[]>([]);
  const [votes, setVotes]       = useState<Vote[]>([]);
  const [people, setPeople]     = useState<Record<string, string>>({});
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefresh]= useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [filter, setFilter]     = useState<'all' | Choice | 'undecided'>('all');
  const [editing, setEditing]   = useState<string | null>(null);
  const [draft, setDraft]       = useState('');

  const fetchData = useCallback(async () => {
    const [{ data: i }, { data: v }, { data: p }] = await Promise.all([
      supabase.from('dads_stuff_items').select('id, media_url, kind, caption, created_at')
        .order('created_at', { ascending: false }),
      supabase.from('dads_stuff_votes').select('item_id, profile_id, choice'),
      supabase.from('profiles').select('id, username'),
    ]);
    setItems((i ?? []) as Item[]);
    setVotes((v ?? []) as Vote[]);
    const names: Record<string, string> = {};
    for (const row of (p ?? []) as any[]) names[row.id] = row.username;
    setPeople(names);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Adding ──────────────────────────────────────────────────────
  // Many at once: going through a houseful of things one photo at a
  // time would be unusable.
  // Two ways in. The camera is photo-only on purpose: recording video
  // captures audio too, and this build does not declare a microphone
  // usage string, so iOS would kill the app the moment the recorder
  // opened. Video already shot in the Camera app picks up fine from the
  // library.
  const add = () => {
    Alert.alert("Add to Dad's Stuff", undefined, [
      { text: 'Take a photo',        onPress: () => pickFrom('camera') },
      { text: 'Choose from library', onPress: () => pickFrom('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const pickFrom = async (source: 'camera' | 'library') => {
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { Alert.alert('Camera access needed', 'Allow camera access to take a photo.'); return; }
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Photos access needed', 'Allow photo access to add things.'); return; }
    }

    const res = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images', 'videos'],
          allowsMultipleSelection: true,
          selectionLimit: 20,
          quality: 0.7,
        });
    if (res.canceled || !profile) return;

    setUploading(true);
    let done = 0, failed = 0;
    for (const asset of res.assets) {
      done += 1;
      setProgress(`Adding ${done} of ${res.assets.length}…`);
      try {
        const isVideo = asset.type === 'video';
        const ext = (asset.uri.split('.').pop() || (isVideo ? 'mov' : 'jpg')).toLowerCase();
        const bytes = await (await fetch(asset.uri)).arrayBuffer();
        const path = `dads-stuff/${profile.id}-${Date.now()}-${done}.${ext}`;
        const { error: upErr } = await supabase.storage.from('photos').upload(path, bytes, {
          contentType: isVideo ? `video/${ext === 'mov' ? 'quicktime' : ext}` : `image/${ext === 'jpg' ? 'jpeg' : ext}`,
          upsert: true,
        });
        if (upErr) throw upErr;
        const url = supabase.storage.from('photos').getPublicUrl(path).data.publicUrl;
        const { error } = await supabase.from('dads_stuff_items').insert({
          family_id: profile.family_id,
          created_by: profile.id,
          media_url: url,
          kind: isVideo ? 'video' : 'image',
        });
        if (error) throw error;
      } catch {
        failed += 1;
      }
    }
    setUploading(false);
    setProgress(null);
    await fetchData();
    if (failed > 0) Alert.alert('Some did not upload', `${failed} of ${res.assets.length} failed. Try those again.`);
  };

  // ── Choosing ────────────────────────────────────────────────────
  const choose = async (itemId: string, choice: Choice) => {
    if (!profile) return;
    const mine = votes.find((v) => v.item_id === itemId && v.profile_id === profile.id);
    // Tapping your current answer again clears it.
    if (mine?.choice === choice) {
      setVotes((vs) => vs.filter((v) => !(v.item_id === itemId && v.profile_id === profile.id)));
      await supabase.from('dads_stuff_votes').delete()
        .eq('item_id', itemId).eq('profile_id', profile.id);
      return;
    }
    setVotes((vs) => [
      ...vs.filter((v) => !(v.item_id === itemId && v.profile_id === profile.id)),
      { item_id: itemId, profile_id: profile.id, choice },
    ]);
    const { error } = await supabase.from('dads_stuff_votes')
      .upsert({ item_id: itemId, profile_id: profile.id, choice }, { onConflict: 'item_id,profile_id' });
    if (error) { Alert.alert('Error', 'Could not save that.'); fetchData(); }
  };

  const saveCaption = async (itemId: string) => {
    const text = draft.trim();
    setEditing(null);
    setItems((is) => is.map((i) => (i.id === itemId ? { ...i, caption: text || null } : i)));
    await supabase.from('dads_stuff_items').update({ caption: text || null }).eq('id', itemId);
  };

  const votesFor = (id: string) => votes.filter((v) => v.item_id === id);
  const myChoice = (id: string) => votes.find((v) => v.item_id === id && v.profile_id === profile?.id)?.choice;

  const shown = items.filter((i) => {
    if (filter === 'all') return true;
    if (filter === 'undecided') return !myChoice(i.id);
    return myChoice(i.id) === filter;
  });

  const FILTERS: { key: typeof filter; label: string }[] = [
    { key: 'all',       label: 'All' },
    { key: 'claim',     label: 'My claims' },
    { key: 'save',      label: "Save at Mom's" },
    { key: 'pass',      label: "Don't want" },
    { key: 'undecided', label: 'Undecided' },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.back}>‹ Home</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Dad's Stuff</Text>
        <Text style={styles.sub}>
          Say what you'd like to keep. Everyone can see everyone's answers, and you can change yours any time.
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={styles.filterWrap}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={String(f.key)}
            style={[styles.chip, filter === f.key && styles.chipOn]}
            onPress={() => setFilter(f.key)}>
            <Text style={[styles.chipText, filter === f.key && styles.chipTextOn]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => {
          setRefresh(true); await fetchData(); setRefresh(false);
        }} />}>
        <TouchableOpacity style={styles.addBtn} onPress={add} disabled={uploading} activeOpacity={0.85}>
          {uploading
            ? <><ActivityIndicator color="#fff" /><Text style={styles.addText}>{progress ?? 'Adding…'}</Text></>
            : <Text style={styles.addText}>+  Take or add photos</Text>}
        </TouchableOpacity>

        {loading && <ActivityIndicator style={{ marginTop: 40 }} color={C.ink} />}
        {!loading && shown.length === 0 && (
          <Text style={styles.empty}>
            {items.length === 0 ? 'Nothing here yet. Add the first photos above.' : 'Nothing in this filter.'}
          </Text>
        )}

        {shown.map((item) => {
          const cast = votesFor(item.id);
          const mine = myChoice(item.id);
          return (
            <View key={item.id} style={styles.card}>
              {item.kind === 'video' ? (
                <TouchableOpacity
                  style={styles.videoTile}
                  activeOpacity={0.85}
                  onPress={() => WebBrowser.openBrowserAsync(item.media_url)}>
                  <Text style={styles.videoPlay}>▶︎</Text>
                  <Text style={styles.videoLabel}>Tap to play</Text>
                </TouchableOpacity>
              ) : (
                <Image source={{ uri: item.media_url }} style={styles.photo} resizeMode="cover" />
              )}

              {editing === item.id ? (
                <View style={styles.capEdit}>
                  <TextInput
                    style={styles.capInput}
                    value={draft}
                    onChangeText={setDraft}
                    placeholder="What is it?"
                    placeholderTextColor={C.inkDim}
                    autoFocus
                    onSubmitEditing={() => saveCaption(item.id)}
                    returnKeyType="done" />
                  <TouchableOpacity onPress={() => saveCaption(item.id)}>
                    <Text style={styles.capSave}>Save</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity onPress={() => { setEditing(item.id); setDraft(item.caption ?? ''); }}>
                  <Text style={[styles.caption, !item.caption && styles.captionEmpty]}>
                    {item.caption || 'Add a label'}
                  </Text>
                </TouchableOpacity>
              )}

              <View style={styles.choiceRow}>
                {CHOICES.map((c) => (
                  <TouchableOpacity
                    key={c.key}
                    style={[styles.choiceBtn, mine === c.key && styles.choiceBtnOn]}
                    onPress={() => choose(item.id, c.key)}
                    activeOpacity={0.8}>
                    <Text style={[styles.choiceText, mine === c.key && styles.choiceTextOn]}>{c.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Who said what. The whole reason this screen exists. */}
              {cast.length > 0 && (
                <View style={styles.tallies}>
                  {CHOICES.map((c) => {
                    const names = cast.filter((v) => v.choice === c.key)
                      .map((v) => people[v.profile_id] ?? '—');
                    if (names.length === 0) return null;
                    return (
                      <Text key={c.key} style={styles.tally}>
                        <Text style={styles.tallyLabel}>{c.short}: </Text>{names.join(', ')}
                      </Text>
                    );
                  })}
                </View>
              )}

            </View>
          );
        })}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: C.bg },
  header:     { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14 },
  back:       { fontSize: 15, fontWeight: '600', color: C.inkMid, marginBottom: 10 },
  title:      { fontSize: 38, fontWeight: '400', fontStyle: 'italic', letterSpacing: -1, color: C.ink },
  sub:        { fontSize: 13, lineHeight: 19, color: C.inkMid, marginTop: 6 },
  filterWrap: { flexGrow: 0, flexShrink: 0 },
  filterRow:  { paddingHorizontal: 20, gap: 8, paddingBottom: 12 },
  chip:       { height: 36, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 999, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  chipOn:     { backgroundColor: C.ink, borderColor: C.ink },
  chipText:   { fontSize: 13, fontWeight: '600', color: C.ink },
  chipTextOn: { color: '#fff' },
  scroll:     { paddingHorizontal: 20 },
  addBtn:     { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.ink, borderRadius: 18, paddingVertical: 16, marginBottom: 16 },
  addText:    { color: '#fff', fontSize: 15, fontWeight: '700' },
  empty:      { fontSize: 14, color: C.inkMid, textAlign: 'center', marginTop: 30 },
  card:       { backgroundColor: C.card, borderRadius: 20, overflow: 'hidden', marginBottom: 16, paddingBottom: 12 },
  photo:      { width: '100%', height: TILE * 1.4, backgroundColor: C.border },
  videoTile:  { width: '100%', height: TILE * 1.4, backgroundColor: '#1c1a16', alignItems: 'center', justifyContent: 'center', gap: 6 },
  videoPlay:  { fontSize: 40, color: '#fff' },
  videoLabel: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  caption:    { fontSize: 15, fontWeight: '600', color: C.ink, paddingHorizontal: 16, paddingTop: 12 },
  captionEmpty:{ color: C.inkDim, fontWeight: '500' },
  capEdit:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 12 },
  capInput:   { flex: 1, backgroundColor: C.bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 15, color: C.ink },
  capSave:    { fontSize: 14, fontWeight: '700', color: C.accent },
  choiceRow:  { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  choiceBtn:  { flex: 1, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg, alignItems: 'center' },
  choiceBtnOn:{ backgroundColor: C.green, borderColor: C.green },
  choiceText: { fontSize: 12, fontWeight: '700', color: C.ink },
  choiceTextOn:{ color: '#fff' },
  tallies:    { paddingHorizontal: 16, paddingTop: 10, gap: 2 },
  tally:      { fontSize: 12, color: C.inkMid, lineHeight: 17 },
  tallyLabel: { fontWeight: '700', color: C.ink },
});
