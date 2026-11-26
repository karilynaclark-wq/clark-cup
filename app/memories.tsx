// Family memories: one box you can either ask or tell.
//
// Typing a question sends it to the `memories` Edge Function, which asks
// Claude over everything the family has recorded -- their own written
// memories plus every weekly photo contest entry -- and answers with the
// records it leaned on. Typing something that happened instead saves it
// as a new memory, with the date and the people pulled out of the
// sentence so it can be found again later.
//
// The conversation is not kept. It is a way into the memories, not a
// chat log, so leaving the screen clears it and nothing is stored.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  ActivityIndicator, RefreshControl, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
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

type Memory = {
  id: string;
  body: string;
  happened_on: string | null;
  happened_text: string | null;
  people: string[];
  source: string;
  created_by: string | null;
  created_at: string;
  profiles?: { username: string } | null;
};

type Turn =
  | { role: 'you'; text: string }
  | { role: 'app'; text: string; saved?: boolean };

// "12 March 2019" / "summer 2019" / "" -- whatever we actually know.
function whenLabel(m: Memory): string {
  if (m.happened_on) {
    const [y, mo, d] = m.happened_on.split('-').map(Number);
    return new Date(y, mo - 1, d).toLocaleDateString(undefined, {
      day: 'numeric', month: 'long', year: 'numeric',
    });
  }
  return m.happened_text ?? '';
}

export default function Memories() {
  const router = useRouter();
  const { profile } = useAuth();

  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [refresh,  setRefresh]  = useState(false);
  const [draft,    setDraft]    = useState('');
  const [asking,   setAsking]   = useState(false);
  const [turns,    setTurns]    = useState<Turn[]>([]);
  const scroller = useRef<ScrollView>(null);

  const fetchData = useCallback(async () => {
    const { data } = await supabase
      .from('memories')
      .select('id, body, happened_on, happened_text, people, source, created_by, created_at, profiles:created_by(username)')
      .order('created_at', { ascending: false });
    setMemories((data ?? []) as any);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = async () => { setRefresh(true); await fetchData(); setRefresh(false); };

  // ── The one box ─────────────────────────────────────────────────
  const send = async () => {
    const text = draft.trim();
    if (!text || asking) return;

    setDraft('');
    setTurns((t) => [...t, { role: 'you', text }]);
    setAsking(true);
    setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 50);

    try {
      const { data, error } = await supabase.functions.invoke('memories', { body: { text } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      const saved = (data as any).intent === 'memory';
      setTurns((t) => [...t, { role: 'app', text: (data as any).reply, saved }]);
      if (saved) await fetchData();
    } catch (err: any) {
      // The function sends a readable reason for the cases we expect
      // (no API key yet, Claude unreachable); anything else gets a plain
      // line rather than a stack trace.
      const why = String(err?.message ?? '');
      setTurns((t) => [...t, {
        role: 'app',
        text: why && !why.startsWith('Edge Function')
          ? why
          : 'Something went wrong reaching the memories. Try again in a moment.',
      }]);
    } finally {
      setAsking(false);
      setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 50);
    }
  };

  // Only your own, and only with a confirm -- a tap away from deleting a
  // family memory is too close.
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
        <Text style={styles.title}>Memories</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}>

        <ScrollView
          ref={scroller}
          style={{ flex: 1 }}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={C.inkMid} />}>

          {turns.length === 0 && (
            <View style={styles.intro}>
              <Text style={styles.introTitle}>Ask, or add one</Text>
              <Text style={styles.introBody}>
                Ask anything about the family — “what did we do for Mom’s birthdays?” — and
                it will answer from what everyone has written down, photo contest entries included.
              </Text>
              <Text style={styles.introBody}>
                Or just say what happened — “Kris got a dog in June 2019” — and it gets kept.
              </Text>
            </View>
          )}

          {turns.map((t, i) => (
            <View
              key={i}
              style={[styles.turn, t.role === 'you' ? styles.turnYou : styles.turnApp]}>
              <Text style={[styles.turnText, t.role === 'you' && styles.turnTextYou]}>{t.text}</Text>
              {t.role === 'app' && t.saved && <Text style={styles.savedTag}>Added to memories</Text>}
            </View>
          ))}

          {asking && (
            <View style={[styles.turn, styles.turnApp, styles.thinking]}>
              <ActivityIndicator size="small" color={C.inkMid} />
              <Text style={styles.thinkingText}>Looking back…</Text>
            </View>
          )}

          {/* ── Everything on the record ─────────────────────── */}
          <Text style={styles.listLabel}>
            {loading
              ? 'Loading…'
              : memories.length === 0
                ? 'Nothing written down yet'
                : `${memories.length} ${memories.length === 1 ? 'memory' : 'memories'}`}
          </Text>

          {memories.map((m) => {
            const when = whenLabel(m);
            const mine = m.created_by === profile?.id;
            return (
              <View key={m.id} style={styles.memory}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.memoryBody}>{m.body}</Text>
                  <Text style={styles.memoryMeta}>
                    {when || 'date unknown'}
                    {m.people.length > 0 && ` · ${m.people.join(', ')}`}
                    {m.profiles?.username && ` · added by ${m.profiles.username}`}
                    {m.source === 'sheet' && ' · imported'}
                  </Text>
                </View>
                {mine && (
                  <TouchableOpacity
                    onPress={() => remove(m)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityLabel="Remove this memory">
                    <Text style={styles.memoryX}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Ask about the family, or add a memory"
            placeholderTextColor={C.inkDim}
            multiline
            maxLength={2000}
            editable={!asking}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!draft.trim() || asking) && styles.sendOff]}
            onPress={send}
            disabled={!draft.trim() || asking}
            accessibilityLabel="Send">
            <Text style={styles.sendText}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: C.bg },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
  back:        { fontSize: 32, color: C.ink, lineHeight: 34 },
  title:       { fontSize: 20, fontWeight: '700', color: C.ink },

  body:        { paddingHorizontal: 20, paddingBottom: 20, gap: 10 },

  intro:       { backgroundColor: C.card, borderRadius: 18, padding: 18, gap: 10, marginTop: 4 },
  introTitle:  { fontSize: 17, fontWeight: '700', color: C.ink },
  introBody:   { fontSize: 14, color: C.inkMid, lineHeight: 20 },

  turn:        { borderRadius: 18, paddingVertical: 12, paddingHorizontal: 16, maxWidth: '88%' },
  turnYou:     { alignSelf: 'flex-end', backgroundColor: C.ink },
  turnApp:     { alignSelf: 'flex-start', backgroundColor: C.card },
  turnText:    { fontSize: 15, color: C.ink, lineHeight: 21 },
  turnTextYou: { color: '#fff' },
  savedTag:    { fontSize: 12, fontWeight: '700', color: C.green, marginTop: 6 },

  thinking:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  thinkingText:{ fontSize: 14, color: C.inkMid },

  listLabel:   { fontSize: 12, fontWeight: '700', color: C.inkDim, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 22, marginBottom: 2 },

  memory:      { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: C.card, borderRadius: 16, padding: 16 },
  memoryBody:  { fontSize: 15, color: C.ink, lineHeight: 21 },
  memoryMeta:  { fontSize: 12, color: C.inkMid, marginTop: 6 },
  memoryX:     { fontSize: 15, color: C.inkDim, paddingTop: 2 },

  composer:    { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.bg },
  input:       { flex: 1, minHeight: 44, maxHeight: 120, backgroundColor: C.card, borderRadius: 22, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 12, fontSize: 15, color: C.ink },
  sendBtn:     { width: 44, height: 44, borderRadius: 22, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  sendOff:     { opacity: 0.3 },
  sendText:    { fontSize: 22, color: '#fff', fontWeight: '700', lineHeight: 24 },
});
