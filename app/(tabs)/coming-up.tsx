// Everything on the family calendar.
//
// The home page shows only the next month, so that it stays a summary.
// This is the whole of it: what is still to come, and everything that
// already happened, which is where you go to put photos on a trip once
// you are home.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import FamilyLogo from '@/components/FamilyLogo';
import ProfileButton from '@/components/ProfileButton';

const C = {
  bg:     '#f5f0e8',
  card:   '#ffffff',
  ink:    '#1c1a16',
  inkMid: 'rgba(28,26,22,0.5)',
  inkDim: 'rgba(28,26,22,0.3)',
  accent: '#d45f2e',
  green:  '#3a6b4a',
};

type Ev = {
  id: string;
  name: string;
  icon: string | null;
  event_date: string;
  end_date: string | null;
  profiles?: { username: string; first_name: string | null } | null;
  photos: number;
};

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function chip(ev: Ev) {
  const [y, m, d] = ev.event_date.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  const month = start.toLocaleDateString(undefined, { month: 'short' }).toUpperCase();
  if (!ev.end_date || ev.end_date === ev.event_date) return { month, days: `${d}` };
  const [ey, em, ed] = ev.end_date.split('-').map(Number);
  if (em !== m || ey !== y) {
    const endMonth = new Date(ey, em - 1, ed).toLocaleDateString(undefined, { month: 'short' }).toUpperCase();
    return { month: `${month}–${endMonth}`, days: `${d}–${ed}` };
  }
  return { month, days: `${d}–${ed}` };
}

export default function ComingUp() {
  const router = useRouter();
  const { profile, familyName } = useAuth();
  const [events,  setEvents]  = useState<Ev[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(false);

  const fetchData = useCallback(async () => {
    const [{ data: evs }, { data: shot }] = await Promise.all([
      supabase.from('upcoming_events')
        .select('id, name, icon, event_date, end_date, profiles!profile_id(username, first_name)')
        .order('event_date', { ascending: true }),
      supabase.from('memories')
        .select('event_id, memory_photos(count)')
        .not('event_id', 'is', null),
    ]);
    const counts = new Map<string, number>();
    for (const row of (shot ?? []) as any[]) {
      counts.set(row.event_id, row.memory_photos?.[0]?.count ?? 0);
    }
    setEvents(((evs ?? []) as any[]).map((e) => ({ ...e, photos: counts.get(e.id) ?? 0 })));
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const iso = todayISO();
  const ahead = events.filter((e) => (e.end_date ?? e.event_date) >= iso);
  // Most recent first: the trip you just got back from is the one you
  // are most likely to be adding photos to.
  const past  = events.filter((e) => (e.end_date ?? e.event_date) < iso).reverse();

  const row = (ev: Ev, i: number, list: Ev[]) => {
    const c = chip(ev);
    const who = ev.profiles?.first_name?.trim() || ev.profiles?.username;
    return (
      <TouchableOpacity
        key={ev.id}
        style={[styles.row, i < list.length - 1 && styles.rowBorder]}
        activeOpacity={0.7}
        onPress={() => router.push(`/event/${ev.id}` as never)}>
        <View style={styles.chip}>
          <Text style={styles.chipMonth}>{c.month}</Text>
          <Text style={styles.chipDays}>{c.days}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={2}>{ev.name}</Text>
          <Text style={styles.who} numberOfLines={1}>{who ?? 'Everyone'}</Text>
        </View>
        <Text style={[styles.photos, ev.photos === 0 && styles.photosNone]}>
          {ev.photos === 0 ? 'Add' : `${ev.photos} 📷`}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={async () => { setRefresh(true); await fetchData(); setRefresh(false); }} tintColor={C.accent} />}>

        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.logoRow}>
              <FamilyLogo />
              <Text style={styles.logoText} numberOfLines={1}>{familyName ?? 'Family Cup'}</Text>
            </View>
            <ProfileButton />
          </View>
          <Text style={styles.pageLabel}>Calendar</Text>
          <Text style={styles.pageTitle}>Coming up.</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>Still to come</Text>
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => router.push({ pathname: '/(tabs)', params: { addEvent: '1' } } as never)}>
              <Text style={styles.addBtnText}>+ Add</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.card}>
            {ahead.length === 0
              ? <Text style={styles.empty}>{loading ? 'Loading…' : 'Nothing planned yet.'}</Text>
              : ahead.map((e, i) => row(e, i, ahead))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Already happened</Text>
          <View style={styles.card}>
            {past.length === 0
              ? <Text style={styles.empty}>Nothing yet.</Text>
              : past.map((e, i) => row(e, i, past))}
          </View>
          <Text style={styles.hint}>
            Open any of these to add photos. They are kept together as one memory, so the
            trip comes back round on its anniversary.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: C.bg },
  scroll:     { paddingBottom: 48 },
  header:     { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 14 },
  headerTop:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  logoRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoText:   { fontSize: 15, fontWeight: '700', color: C.ink },
  pageLabel:  { fontSize: 11, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: C.inkDim },
  pageTitle:  { fontSize: 32, fontWeight: '800', color: C.ink, marginTop: 2 },

  section:    { paddingHorizontal: 20, paddingTop: 18 },
  labelRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  label:      { fontSize: 11, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: C.inkDim, marginBottom: 10 },
  addBtn:     { backgroundColor: 'rgba(58,107,74,0.10)', borderRadius: 14, paddingVertical: 6, paddingHorizontal: 12, marginBottom: 10 },
  addBtnText: { fontSize: 12, fontWeight: '700', color: C.green },

  card:       { backgroundColor: C.card, borderRadius: 20, overflow: 'hidden' },
  empty:      { fontSize: 13, color: C.inkMid, padding: 16 },
  row:        { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 16 },
  rowBorder:  { borderBottomWidth: 1, borderBottomColor: 'rgba(28,26,22,0.07)' },
  chip:       { width: 46, paddingVertical: 6, borderRadius: 10, backgroundColor: '#efe7d8', alignItems: 'center' },
  chipMonth:  { fontSize: 8, fontWeight: '800', color: C.inkMid, letterSpacing: 0.5 },
  chipDays:   { fontSize: 13, fontWeight: '800', color: C.ink, marginTop: 1 },
  name:       { fontSize: 15, fontWeight: '700', color: C.ink },
  who:        { fontSize: 13, color: C.inkMid, marginTop: 2 },
  photos:     { fontSize: 13, fontWeight: '700', color: C.ink },
  photosNone: { color: C.green },
  hint:       { fontSize: 12, color: C.inkMid, lineHeight: 18, marginTop: 10, paddingHorizontal: 4 },
});
