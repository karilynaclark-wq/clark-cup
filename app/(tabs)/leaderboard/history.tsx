import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { COLORS } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

type Champion = { year: string; winner: string; note?: string };

export default function HistoryScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const [winners, setWinners] = useState<Champion[]>([]);
  const [loading, setLoading] = useState(true);

  // Each family keeps its own champions; this used to be a hardcoded
  // array, so every family saw the Clarks' winners.
  useEffect(() => {
    if (!profile?.family_id) { setLoading(false); return; }
    supabase
      .from('families')
      .select('champions')
      .eq('id', profile.family_id)
      .maybeSingle()
      .then(({ data }) => {
        const list = (data as any)?.champions;
        if (Array.isArray(list)) setWinners(list as Champion[]);
        setLoading(false);
      });
  }, [profile?.family_id]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Family Cup History',
          headerStyle: { backgroundColor: COLORS.primary },
          headerTintColor: COLORS.white,
          headerTitleStyle: { fontWeight: '700', color: COLORS.white },
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
              hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
            >
              <FontAwesome5 name="chevron-left" size={14} color={COLORS.white} />
              <Text style={{ color: COLORS.white, fontSize: 16 }}>Leaderboard</Text>
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.trophyHeader}>
          <Text style={styles.trophyEmoji}>🏆</Text>
          <Text style={styles.trophyTitle}>Past Champions</Text>
          <Text style={styles.trophySubtitle}>Glory to the victor.</Text>
        </View>

        {loading && <ActivityIndicator style={{ marginTop: 24 }} color={COLORS.primary} />}

        {!loading && winners.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No champions yet</Text>
            <Text style={styles.emptyBody}>
              When your family finishes its first cup, the winner will be recorded here.
            </Text>
          </View>
        )}

        {winners.map((entry, i) => (
          <View key={entry.year} style={[styles.card, i === 0 && styles.cardFirst]}>
            <View style={styles.cardLeft}>
              <Text style={styles.medal}>🥇</Text>
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.winner}>{entry.winner}</Text>
              {entry.note ? <Text style={styles.note}>{entry.note}</Text> : null}
            </View>
            <View style={styles.yearBadge}>
              <Text style={styles.yearText}>{entry.year}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 20, paddingBottom: 40 },

  trophyHeader: {
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    paddingVertical: 28,
    marginBottom: 24,
  },
  trophyEmoji: { fontSize: 52, marginBottom: 8 },
  trophyTitle: { fontSize: 24, fontWeight: '800', color: COLORS.white },
  trophySubtitle: { fontSize: 14, color: COLORS.accent, marginTop: 4, fontStyle: 'italic' },

  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardFirst: {
    borderColor: COLORS.gold,
    borderWidth: 2,
  },
  emptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  emptyBody:  { fontSize: 13, color: COLORS.primaryMuted, textAlign: 'center', lineHeight: 19 },
  cardLeft: { marginRight: 14 },
  medal: { fontSize: 32 },
  cardBody: { flex: 1 },
  winner: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  note: { fontSize: 13, color: COLORS.primaryMuted, marginTop: 2, fontWeight: '500' },
  yearBadge: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  yearText: { color: COLORS.white, fontWeight: '800', fontSize: 15 },
});
