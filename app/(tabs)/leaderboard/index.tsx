import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { supabase, Profile } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

// ── Design tokens ──────────────────────────────────────────────
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
  greenLt:  '#5a9b6e',
};

// Consistent person colors (deterministic by name)
const PERSON_COLORS: Record<string, string> = {
  Kris:  '#d45f2e',
  Kari:  '#3a6b4a',
  Mom:   '#7a6abf',
  Kelly: '#c4860a',
  Kyle:  '#2a7fa5',
};
const FALLBACK_COLORS = ['#d45f2e','#3a6b4a','#7a6abf','#c4860a','#2a7fa5','#b45a7a'];
function personColor(name: string, index: number) {
  return PERSON_COLORS[name] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

const CHART_H = 140; // px height of chart area

export default function LeaderboardScreen() {
  const { profile: myProfile } = useAuth();
  const [profiles, setProfiles]   = useState<Profile[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  // One animated value per bar (max 10 family members), using translateY + useNativeDriver: true
  const slideAnims = useRef(Array.from({ length: 10 }, () => new Animated.Value(0))).current;

  const fetchLeaderboard = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('total_points', { ascending: false });
    if (data) setProfiles(data as Profile[]);
  }, []);

  useEffect(() => { fetchLeaderboard(); }, [fetchLeaderboard]);

  // Animate bars sliding up from bottom when data loads
  useEffect(() => {
    if (profiles.length === 0) return;
    const maxPtsLocal = profiles[0]?.total_points ?? 1;
    const anims = profiles.map((p, i) => {
      const barH = CHART_H * (p.total_points / maxPtsLocal);
      slideAnims[i].setValue(barH); // start below
      return Animated.timing(slideAnims[i], {
        toValue: 0,
        duration: 700,
        delay: i * 60,
        useNativeDriver: true,
      });
    });
    Animated.parallel(anims).start();
  }, [profiles]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchLeaderboard();
    setRefreshing(false);
  };

  const maxPts  = profiles[0]?.total_points ?? 1;
  // Mini bar uses a separate opacity-based anim (native driver compatible)
  const listAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (profiles.length === 0) return;
    listAnim.setValue(0);
    Animated.timing(listAnim, { toValue: 1, duration: 600, delay: 200, useNativeDriver: true }).start();
  }, [profiles]);

  const getRankLabel = (rank: number) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  };

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
          <Text style={styles.pageLabel}>Rankings</Text>
          <Text style={styles.pageTitle}>Leaderboard.</Text>
        </View>

        {/* ── BAR CHART ──────────────────────────────────── */}
        {profiles.length > 0 && (
          <View style={styles.chartCard}>
            <View style={styles.barsArea}>
              {profiles.map((p, i) => {
                const isMe  = p.id === myProfile?.id;
                const pct   = maxPts > 0 ? p.total_points / maxPts : 0;
                const color = personColor(p.username, i);
                const barH  = Math.max(CHART_H * pct, 8);
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={styles.barCol}
                    onPress={() => router.push(`/(tabs)/leaderboard/${p.id}`)}
                    activeOpacity={0.75}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  >
                    {/* Clip container so translateY slide-up is contained */}
                    <View style={[styles.barClip, { height: barH }]}>
                      <Animated.View
                        style={[styles.bar, { height: barH, backgroundColor: color, transform: [{ translateY: slideAnims[i] }] }]}
                      >
                        <Text style={styles.barPtsInner}>{p.total_points.toLocaleString()}</Text>
                        {isMe && <View style={styles.barDot} />}
                      </Animated.View>
                    </View>
                    <Text style={[styles.barName, isMe && styles.barNameMe]}>{p.username}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* ── RANKED LIST ────────────────────────────────── */}
        <View style={styles.listCard}>
          {profiles.map((p, i) => {
            const rank  = i + 1;
            const isMe  = p.id === myProfile?.id;
            const pct   = maxPts > 0 ? p.total_points / maxPts : 0;
            const color = personColor(p.username, i);
            const isMedal = rank <= 3;

            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.lbRow, isMe && styles.lbRowMe, i < profiles.length - 1 && styles.lbBorder]}
                onPress={() => router.push(`/(tabs)/leaderboard/${p.id}`)}
                activeOpacity={0.7}
              >
                {/* Medal or rank number */}
                {isMedal ? (
                  <Text style={styles.lbMedal}>{getRankLabel(rank)}</Text>
                ) : (
                  <Text style={styles.lbRankNum}>#{rank}</Text>
                )}

                {/* Colored dot */}
                <View style={[styles.lbDot, { backgroundColor: color }]} />

                {/* Name */}
                <Text style={styles.lbName}>
                  {p.username}
                  {isMe ? <Text style={styles.youTag}> you</Text> : null}
                </Text>

                {/* Mini bar — static width, fade in via listAnim (native driver) */}
                <Animated.View style={[styles.miniBarWrap, { opacity: listAnim }]}>
                  <View style={[styles.miniBarFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
                </Animated.View>

                {/* Points */}
                <Text style={styles.lbPts}>{p.total_points.toLocaleString()}</Text>

                <Text style={styles.lbChevron}>›</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── HISTORY LINK ───────────────────────────────── */}
        <TouchableOpacity
          style={styles.historyLink}
          onPress={() => router.push('/(tabs)/leaderboard/history')}
          activeOpacity={0.6}
        >
          <Text style={styles.historyIcon}>🏆</Text>
          <Text style={styles.historyLabel}>Family Cup History</Text>
          <Text style={styles.historyChevron}>›</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scroll:    { paddingBottom: 48 },

  // Header
  header:      { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 20 },
  headerTop:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  logoRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoIcon:    { width: 30, height: 30, backgroundColor: C.ink, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  logoEmoji:   { fontSize: 15 },
  logoText:    { fontSize: 15, fontWeight: '600', color: C.ink },
  headerYear:  { fontSize: 13, fontWeight: '500', color: C.inkMid },
  pageLabel:   { fontSize: 13, fontWeight: '500', color: C.inkMid, marginBottom: 2 },
  pageTitle:   { fontSize: 52, fontWeight: '400', lineHeight: 48, letterSpacing: -1.5, color: C.ink, fontStyle: 'italic', marginBottom: 4 },

  // Bar chart
  chartCard: {
    marginHorizontal: 20,
    backgroundColor: C.card,
    borderRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  barsArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    height: CHART_H,
    marginBottom: 10,
  },
  barCol:      { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 6, height: '100%' },
  barClip:     { width: '100%', overflow: 'hidden', borderRadius: 8 },
  bar:         { width: '100%', borderRadius: 8, position: 'relative', minHeight: 4 },
  barPtsInner: { position: 'absolute', top: 8, alignSelf: 'center', fontSize: 10, fontStyle: 'italic', color: 'rgba(255,255,255,0.85)', letterSpacing: -0.2 },
  barDot:      { position: 'absolute', top: 22, alignSelf: 'center', width: 6, height: 6, backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 3 },
  barName:   { fontSize: 11, fontWeight: '600', color: C.inkMid, letterSpacing: 0.2 },
  barNameMe: { color: C.green, fontWeight: '700' },

  // Ranked list
  listCard: {
    marginHorizontal: 20,
    marginTop: 14,
    backgroundColor: C.card,
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  lbBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  lbRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 13 },
  lbRowMe:  { backgroundColor: C.greenBg },
  lbMedal:  { fontSize: 16, width: 22, textAlign: 'center' },
  lbRankNum:{ fontSize: 11, fontWeight: '600', color: C.inkDim, width: 22, textAlign: 'center' },
  lbDot:    { width: 8, height: 8, borderRadius: 4 },
  lbName:   { flex: 1, fontSize: 14, fontWeight: '600', color: C.ink },
  youTag:   { fontSize: 10, fontWeight: '500', color: C.greenLt },
  miniBarWrap: { width: 72, height: 4, backgroundColor: 'rgba(28,26,22,0.07)', borderRadius: 99, overflow: 'hidden' },
  miniBarFill: { height: '100%', borderRadius: 99 },
  lbPts:    { fontSize: 17, color: C.ink, letterSpacing: -0.3, fontStyle: 'italic', width: 48, textAlign: 'right' },
  lbChevron:{ fontSize: 15, color: C.inkDim },

  // History link
  historyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 24,
    marginTop: 14,
    opacity: 0.55,
    minHeight: 44,
  },
  historyIcon:    { fontSize: 14 },
  historyLabel:   { flex: 1, fontSize: 12, fontWeight: '600', color: C.ink, letterSpacing: 0.2 },
  historyChevron: { fontSize: 14, color: C.inkDim },
});
