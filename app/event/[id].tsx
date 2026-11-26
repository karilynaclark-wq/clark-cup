// One event, and the photos from it.
//
// An upcoming event is a plan; once it has happened it is something the
// family did. Adding the first photo turns it into a memory -- one
// memory per event, with every photo attached to it -- so a trip shows
// up in search and comes back round on its anniversary.
//
// Photos are added after you get home, by which time the trip has
// dropped off "Coming up", so this page is reached from the Trips
// section on the Memories screen as well as from the home page.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert,
  ActivityIndicator, RefreshControl, Dimensions, Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

const { width: SCREEN_W } = Dimensions.get('window');
const TILE = (SCREEN_W - 20 * 2 - 10) / 2;
const QUALITY = 0.4;              // same as Dad's Stuff: ~1MB, not 5

const C = {
  bg:     '#f5f0e8',
  card:   '#ffffff',
  ink:    '#1c1a16',
  inkMid: 'rgba(28,26,22,0.5)',
  inkDim: 'rgba(28,26,22,0.3)',
  border: 'rgba(28,26,22,0.08)',
  accent: '#d45f2e',
  green:  '#3a6b4a',
};

type Ev = {
  id: string;
  name: string;
  icon: string | null;
  event_date: string;
  end_date: string | null;
  date_label: string | null;
  profiles?: { username: string; first_name: string | null } | null;
};

type Photo = {
  id: string;
  url: string;
  kind: 'image' | 'video';
  created_by: string | null;
  profiles?: { username: string } | null;
};

function spanLabel(ev: Ev): string {
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const a = fmt(ev.event_date);
  const long: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };
  if (!ev.end_date || ev.end_date === ev.event_date) return a.toLocaleDateString(undefined, long);
  const b = fmt(ev.end_date);
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  return sameMonth
    ? `${a.getDate()}–${b.toLocaleDateString(undefined, long)}`
    : `${a.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })} – ${b.toLocaleDateString(undefined, long)}`;
}

export default function EventPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();          // read outside the Modal
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();

  const [ev,      setEv]      = useState<Ev | null>(null);
  const [photos,  setPhotos]  = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(false);
  const [busy,    setBusy]    = useState(false);
  const [status,  setStatus]  = useState('');
  const [viewing, setViewing] = useState<Photo | null>(null);
  const picking = useRef(false);               // guards the double tap
  const seen = useRef<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    const { data: e } = await supabase
      .from('upcoming_events')
      .select('id, name, icon, event_date, end_date, date_label, profiles!profile_id(username, first_name)')
      .eq('id', id)
      .maybeSingle();
    setEv(e as any);

    const { data: mem } = await supabase
      .from('memories').select('id').eq('event_id', id).maybeSingle();
    if (mem) {
      const { data: ps } = await supabase
        .from('memory_photos')
        .select('id, url, kind, created_by, profiles:created_by(username)')
        .eq('memory_id', (mem as any).id)
        .order('created_at', { ascending: true });
      setPhotos((ps ?? []) as any);
    } else {
      setPhotos([]);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // The memory this event's photos hang off, made on demand so an event
  // nobody photographs never becomes a memory.
  const ensureMemory = async (e: Ev): Promise<string> => {
    const { data: found } = await supabase
      .from('memories').select('id').eq('event_id', e.id).maybeSingle();
    if (found) return (found as any).id;

    const who = e.profiles?.first_name?.trim() || e.profiles?.username;
    const { data: made, error } = await supabase.from('memories').insert({
      family_id: profile!.family_id,
      body: `${e.name}, ${spanLabel(e)}.${who ? ` For ${who}.` : ''}`,
      happened_on: e.event_date,
      people: who ? [who] : [],
      source: 'app',
      kind: 'memory',
      event_id: e.id,
      created_by: profile!.id,
    }).select('id').single();
    if (error) {
      // Someone else added a photo a moment ago; use theirs.
      const { data: race } = await supabase
        .from('memories').select('id').eq('event_id', e.id).maybeSingle();
      if (race) return (race as any).id;
      throw error;
    }
    return (made as any).id;
  };

  const addPhotos = async () => {
    if (!ev || picking.current) return;
    picking.current = true;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow photo access.');
        return;
      }
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: true,
        quality: QUALITY,
      });
      if (picked.canceled || picked.assets.length === 0) return;

      setBusy(true);
      const memoryId = await ensureMemory(ev);
      const stamp = Date.now();
      const failures: { index: number; why: string }[] = [];

      for (let i = 0; i < picked.assets.length; i++) {
        const asset = picked.assets[i];
        if (asset.assetId && seen.current.has(asset.assetId)) continue;
        setStatus(`Adding ${i + 1} of ${picked.assets.length}…`);

        const attempt = async () => {
          const isVideo = asset.type === 'video';
          const ext = (asset.uri.split('.').pop() ?? (isVideo ? 'mov' : 'jpg')).toLowerCase();
          const path = `events/${ev.id}/${profile!.id}-${stamp}-${i}.${ext}`;
          const bytes = await (await fetch(asset.uri)).arrayBuffer();
          const { error: upErr } = await supabase.storage.from('photos').upload(path, bytes, {
            contentType: isVideo
              ? `video/${ext === 'mov' ? 'quicktime' : ext}`
              : `image/${ext === 'jpg' ? 'jpeg' : ext}`,
            upsert: true,
          });
          if (upErr) throw upErr;
          const url = supabase.storage.from('photos').getPublicUrl(path).data.publicUrl;
          const { error } = await supabase.from('memory_photos').insert({
            memory_id: memoryId,
            family_id: profile!.family_id,
            url,
            kind: isVideo ? 'video' : 'image',
            created_by: profile!.id,
          });
          if (error) throw error;
          if (asset.assetId) seen.current.add(asset.assetId);
        };

        try {
          await attempt();
        } catch {
          try {
            setStatus(`Retrying ${i + 1} of ${picked.assets.length}…`);
            await attempt();
          } catch (err: any) {
            failures.push({ index: i + 1, why: String(err?.message ?? 'unknown') });
          }
        }
      }

      await fetchData();
      if (failures.length > 0) {
        Alert.alert(
          `${failures.length} of ${picked.assets.length} did not upload`,
          `Number${failures.length > 1 ? 's' : ''} ${failures.map((f) => f.index).join(', ')} ` +
          `in the order you picked them.\n\n${failures[0].why}`,
        );
      }
    } catch (err: any) {
      Alert.alert('Could not add those', String(err?.message ?? 'Something went wrong.'));
    } finally {
      picking.current = false;
      setBusy(false);
      setStatus('');
    }
  };

  const removePhoto = (p: Photo) => {
    Alert.alert('Remove this photo?', 'It will go for everyone.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('memory_photos').delete().eq('id', p.id);
          if (error) { Alert.alert('Could not remove that.'); return; }
          setViewing(null);
          await fetchData();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{ev?.name ?? 'Event'}</Text>
        <View style={{ width: 18 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={async () => { setRefresh(true); await fetchData(); setRefresh(false); }} tintColor={C.inkMid} />}>

        {ev && (
          <View style={styles.card}>
            <Text style={styles.evIcon}>{ev.icon ?? '📅'}</Text>
            <Text style={styles.evName}>{ev.name}</Text>
            <Text style={styles.evWhen}>{spanLabel(ev)}</Text>
            <Text style={styles.evFor}>
              {ev.profiles?.first_name?.trim() || ev.profiles?.username || 'Everyone'}
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.add, busy && styles.addBusy]}
          onPress={addPhotos}
          disabled={busy || !ev}
          activeOpacity={0.85}>
          {busy
            ? <><ActivityIndicator color="#fff" /><Text style={styles.addText}>{status || 'Adding…'}</Text></>
            : <Text style={styles.addText}>+  Add photos from this</Text>}
        </TouchableOpacity>

        <Text style={styles.count}>
          {loading
            ? 'Loading…'
            : photos.length === 0
              ? 'No photos yet'
              : `${photos.length} ${photos.length === 1 ? 'photo' : 'photos'} — kept as a memory`}
        </Text>

        <View style={styles.grid}>
          {photos.map((p) => (
            <TouchableOpacity key={p.id} activeOpacity={0.9} onPress={() => setViewing(p)}>
              {p.kind === 'video' ? (
                <View style={[styles.tile, styles.videoTile]}><Text style={styles.play}>▶︎</Text></View>
              ) : (
                <Image source={{ uri: p.url }} style={styles.tile} resizeMode="cover" />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* ── Full screen ───────────────────────────────────── */}
      <Modal visible={!!viewing} animationType="fade" onRequestClose={() => setViewing(null)}>
        {viewing && (
          <View style={[styles.viewer, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
            <View style={styles.viewerBar}>
              <TouchableOpacity onPress={() => setViewing(null)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Text style={styles.viewerClose}>✕</Text>
              </TouchableOpacity>
              {viewing.created_by === profile?.id && (
                <TouchableOpacity onPress={() => removePhoto(viewing)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Text style={styles.viewerClose}>🗑</Text>
                </TouchableOpacity>
              )}
            </View>
            {viewing.kind === 'video' ? (
              <TouchableOpacity
                style={styles.viewerVideo}
                activeOpacity={0.8}
                onPress={() => WebBrowser.openBrowserAsync(viewing.url)}>
                <Text style={styles.viewerPlay}>▶︎</Text>
                <Text style={styles.viewerHint}>Tap to play</Text>
              </TouchableOpacity>
            ) : (
              <Image source={{ uri: viewing.url }} style={styles.viewerImg} resizeMode="contain" />
            )}
            <Text style={styles.viewerWho}>
              Added by {viewing.profiles?.username ?? 'someone'}
            </Text>
          </View>
        )}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: C.bg },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
  back:        { fontSize: 32, color: C.ink, lineHeight: 34 },
  title:       { flex: 1, fontSize: 19, fontWeight: '700', color: C.ink, textAlign: 'center' },

  body:        { paddingHorizontal: 20, paddingBottom: 30 },
  card:        { backgroundColor: C.card, borderRadius: 20, padding: 20, alignItems: 'center' },
  evIcon:      { fontSize: 34 },
  evName:      { fontSize: 20, fontWeight: '700', color: C.ink, marginTop: 8, textAlign: 'center' },
  evWhen:      { fontSize: 14, color: C.inkMid, marginTop: 4 },
  evFor:       { fontSize: 13, color: C.inkDim, marginTop: 2 },

  add:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: C.green, borderRadius: 16, paddingVertical: 15, marginTop: 14 },
  addBusy:     { opacity: 0.85 },
  addText:     { fontSize: 15, fontWeight: '700', color: '#fff' },

  count:       { fontSize: 12, fontWeight: '700', color: C.inkDim, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 22, marginBottom: 10 },
  grid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile:        { width: TILE, height: TILE, borderRadius: 14, backgroundColor: '#e8e2d8' },
  videoTile:   { backgroundColor: '#1c1a16', alignItems: 'center', justifyContent: 'center' },
  play:        { fontSize: 36, color: '#fff' },

  viewer:      { flex: 1, backgroundColor: '#000' },
  viewerBar:   { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 10 },
  viewerClose: { fontSize: 22, color: '#fff' },
  viewerImg:   { flex: 1, width: '100%' },
  viewerVideo: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  viewerPlay:  { fontSize: 60, color: '#fff' },
  viewerHint:  { fontSize: 14, color: 'rgba(255,255,255,0.7)' },
  viewerWho:   { fontSize: 13, color: 'rgba(255,255,255,0.6)', textAlign: 'center', paddingVertical: 14 },
});
