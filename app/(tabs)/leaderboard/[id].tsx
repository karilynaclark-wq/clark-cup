import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Image,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { supabase, Profile, PointSubmission } from '@/lib/supabase';
import { COLORS } from '@/constants/Colors';

const CATEGORY_LABELS: Record<string, string> = {
  sunday_call: 'Sunday Call',
  weekly_photo: 'Weekly Photo',
  miscellaneous: 'Miscellaneous',
};

const CATEGORY_ICONS: Record<string, string> = {
  sunday_call: '📞',
  weekly_photo: '📸',
  miscellaneous: '⭐',
};

export default function UserHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [submissions, setSubmissions] = useState<PointSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    const [{ data: profileData }, { data: submissionData }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', id).single(),
      supabase
        .from('point_submissions')
        .select('*')
        .eq('user_id', id)
        .order('submitted_at', { ascending: false }),
    ]);

    if (profileData) setProfile(profileData as Profile);
    if (submissionData) setSubmissions(submissionData as PointSubmission[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

  const getInitials = (name: string) =>
    name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  const renderItem = ({ item }: { item: PointSubmission }) => {
    const isCustom = item.category === 'miscellaneous' && item.custom_name;
    const label = isCustom ? item.custom_name! : CATEGORY_LABELS[item.category];
    const icon = CATEGORY_ICONS[item.category];

    return (
      <View style={styles.row}>
        <View style={styles.rowIcon}>
          <Text style={styles.rowIconText}>{icon}</Text>
        </View>
        <View style={styles.rowInfo}>
          <Text style={styles.rowLabel}>{label}</Text>
          <Text style={styles.rowDate}>{formatDate(item.submitted_at)}</Text>
          {item.notes ? (
            <Text style={styles.rowNotes}>{item.notes}</Text>
          ) : null}
        </View>
        <Text style={styles.rowPoints}>+{item.points}</Text>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Stack.Screen options={{ headerShown: true, title: '', headerStyle: { backgroundColor: COLORS.primary } }} />
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: profile?.username ?? 'Points History',
          headerStyle: { backgroundColor: COLORS.primary },
          headerTintColor: COLORS.white,
          headerTitleStyle: { fontWeight: '700', color: COLORS.white },
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}>
              <FontAwesome5 name="chevron-left" size={14} color={COLORS.white} />
              <Text style={{ color: COLORS.white, fontSize: 16 }}>Leaderboard</Text>
            </TouchableOpacity>
          ),
        }}
      />

      <FlatList
        data={submissions}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarInitials}>
                  {getInitials(profile?.username ?? '?')}
                </Text>
              </View>
            )}
            <Text style={styles.name}>{profile?.username}</Text>
            <View style={styles.totalBadge}>
              <Text style={styles.totalPoints}>{profile?.total_points ?? 0}</Text>
              <Text style={styles.totalLabel}>total points</Text>
            </View>
            <Text style={styles.historyTitle}>
              Point History ({submissions.length} {submissions.length === 1 ? 'entry' : 'entries'})
            </Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>No submissions yet.</Text>
        }
        contentContainerStyle={styles.list}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  list: { padding: 16, paddingBottom: 40 },

  header: { alignItems: 'center', marginBottom: 24, paddingTop: 8 },
  avatar: { width: 80, height: 80, borderRadius: 40, borderWidth: 3, borderColor: COLORS.primary },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: { fontSize: 28, fontWeight: '800', color: COLORS.white },
  name: { fontSize: 24, fontWeight: '800', color: COLORS.text, marginTop: 12 },
  totalBadge: {
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 24,
  },
  totalPoints: { fontSize: 40, fontWeight: '900', color: COLORS.white },
  totalLabel: { fontSize: 13, color: COLORS.accent, fontWeight: '500' },
  historyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    alignSelf: 'flex-start',
  },

  row: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowIconText: { fontSize: 20 },
  rowInfo: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  rowDate: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  rowNotes: { fontSize: 12, color: COLORS.textSecondary, marginTop: 3, fontStyle: 'italic' },
  rowPoints: { fontSize: 17, fontWeight: '800', color: COLORS.primaryMuted },

  emptyText: { color: COLORS.textSecondary, textAlign: 'center', paddingVertical: 20, fontSize: 14 },
});
