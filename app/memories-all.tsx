// Every memory, newest first.
//
// The Memories screen deliberately does not lead with a list -- a wall of
// entries is not how anyone wants to meet their own family history. This
// is where the list lives instead, behind "See all", for the times you
// do want to scan the lot or find one to remove.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

const C = {
  bg:     '#f5f0e8',
  card:   '#ffffff',
  ink:    '#1c1a16',
  inkMid: 'rgba(28,26,22,0.5)',
  inkDim: 'rgba(28,26,22,0.3)',
};

type Memory = {
  id: string;
  body: string;
  happened_on: string | null;
  happened_text: string | null;
  people: string[];
  source: string;
  created_by: string | null;
  profiles?: { username: string } | null;
};

function whenLabel(m: Memory): string {
  if (m.happened_on) {
    const [y, mo, d] = m.happened_on.split('-').map(Number);
    return new Date(y, mo - 1, d).toLocaleDateString(undefined, {
      day: 'numeric', month: 'long', year: 'numeric',
    });
  }
  return m.happened_text ?? '';
}

export default function MemoriesAll() {
  const router = useRouter();
  const { profile } = useAuth();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [refresh,  setRefresh]  = useState(false);

  const fetchData = useCallback(async () => {
    const { data } = await supabase
      .from('memories')
      .select('id, body, happened_on, happened_text, people, source, created_by, profiles:created_by(username)')
      .order('happened_on', { ascending: false, nullsFirst: false });
    setMemories((data ?? []) as any);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const remove = (m: Memory) => {
    Alert.alert('Remove this memory?', m.body, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('memories').delete().eq('id', m.id);
          if (error) { Alert.alert('Could not remove that.'); return; }
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
        <Text style={styles.title}>All memories</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={async () => { setRefresh(true); await fetchData(); setRefresh(false); }} tintColor={C.inkMid} />}>
        <Text style={styles.count}>
          {loading
            ? 'Loading…'
            : memories.length === 0
              ? 'Nothing written down yet'
              : `${memories.length} ${memories.length === 1 ? 'memory' : 'memories'}`}
        </Text>

        {memories.map((m) => (
          <View key={m.id} style={styles.memory}>
            <View style={{ flex: 1 }}>
              <Text style={styles.memoryBody}>{m.body}</Text>
              <Text style={styles.memoryMeta}>
                {whenLabel(m) || 'date unknown'}
                {m.people.length > 0 && ` · ${m.people.join(', ')}`}
                {m.profiles?.username && ` · added by ${m.profiles.username}`}
                {m.source === 'sheet' && ' · imported'}
              </Text>
            </View>
            {m.created_by === profile?.id && (
              <TouchableOpacity
                onPress={() => remove(m)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="Remove this memory">
                <Text style={styles.memoryX}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: C.bg },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
  back:       { fontSize: 32, color: C.ink, lineHeight: 34 },
  title:      { fontSize: 20, fontWeight: '700', color: C.ink },
  body:       { paddingHorizontal: 20, paddingBottom: 30, gap: 10 },
  count:      { fontSize: 12, fontWeight: '700', color: C.inkDim, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 },
  memory:     { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: C.card, borderRadius: 16, padding: 16 },
  memoryBody: { fontSize: 15, color: C.ink, lineHeight: 21 },
  memoryMeta: { fontSize: 12, color: C.inkMid, marginTop: 6 },
  memoryX:    { fontSize: 15, color: C.inkDim, paddingTop: 2 },
});
