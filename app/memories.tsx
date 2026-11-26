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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Image } from 'react-native';
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

type Shot = {
  id: string;
  photo_url: string;
  caption: string | null;
  kind: 'image' | 'video';
  profiles?: { username: string } | null;
};

type Turn =
  | { role: 'you'; text: string }
  | { role: 'app'; text: string; saved?: boolean };

// The Monday this week began on, which is how both the photo contest
// and the weekly picks name a week.
function mondayOf(d: Date): string {
  const dow = (d.getDay() + 6) % 7;
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow);
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-${String(m.getDate()).padStart(2, '0')}`;
}

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
  const { q, add } = useLocalSearchParams<{ q?: string; add?: string }>();
  const { profile } = useAuth();
  const input = useRef<TextInput>(null);

  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [refresh,  setRefresh]  = useState(false);
  const [draft,    setDraft]    = useState('');
  const [asking,   setAsking]   = useState(false);
  const [turns,    setTurns]    = useState<Turn[]>([]);
  const [prompts,  setPrompts]  = useState<string[]>([]);
  const [featured, setFeatured] = useState<Memory | null>(null);
  const [lastYear, setLastYear] = useState<Shot[]>([]);
  const [people,   setPeople]   = useState<{ name: string; n: number }[]>([]);
  const scroller = useRef<ScrollView>(null);

  const fetchData = useCallback(async () => {
    const thisWeek = mondayOf(new Date());
    // 364 days keeps it on a Monday, so it lines up with how contest
    // weeks are named.
    const back = new Date();
    back.setDate(back.getDate() - 364);
    const lastYearWeek = mondayOf(back);

    const [{ data: mems }, { data: shots }] = await Promise.all([
      supabase.from('memories')
        .select('id, body, happened_on, happened_text, people, source, created_by, created_at, profiles:created_by(username)')
        .order('created_at', { ascending: false }),
      supabase.from('photo_entries')
        .select('id, photo_url, caption, kind, profiles(username)')
        .eq('week_start', lastYearWeek),
    ]);

    const all = (mems ?? []) as any as Memory[];
    setMemories(all);

    // The family record names a lot of people. Only those with a page
    // worth opening get a button, and the household comes first.
    const { data: known } = await supabase
      .from('memories').select('people').eq('kind', 'knowledge');
    const tally = new Map<string, number>();
    for (const row of (known ?? []) as any[]) {
      for (const name of row.people ?? []) tally.set(name, (tally.get(name) ?? 0) + 1);
    }
    // Dad and Art are the same man, Mom and Kathy the same woman; show
    // one button each rather than two that go to the same life. Partners
    // and pets belong to whoever they came with -- Lance is part of
    // Kelly's life, Eve and Brittany of Kris's, Duke of Kari's -- so they
    // are still tagged and searchable, just not given a page of their own.
    for (const alias of ['Art', 'Kathy']) tally.delete(alias);
    for (const attached of ['Lance', 'Eve', 'Brittany', 'Duke']) tally.delete(attached);
    const household = ['Dad', 'Mom', 'Kelly', 'Kris', 'Kari', 'Kyle'];
    setPeople(
      [...tally.entries()]
        .filter(([name, n]) => n >= 5 || household.includes(name))
        .sort((a, b) => {
          const ia = household.indexOf(a[0]), ib = household.indexOf(b[0]);
          if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
          return b[1] - a[1];
        })
        .map(([name, n]) => ({ name, n })),
    );
    setLastYear((shots ?? []) as any);
    setLoading(false);

    // This week's suggestions and featured memory. Cached per week, so
    // this only costs a Claude request for whoever opens it first.
    if (all.length > 0) {
      const { data: wk } = await supabase.functions.invoke('memories', { body: { action: 'week' } });
      if (wk && (wk as any).week === thisWeek) {
        setPrompts((wk as any).prompts ?? []);
        setFeatured(all.find((m) => m.id === (wk as any).memory_id) ?? null);
      }
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Handed a question by the home page: ask it without making them type
  // it twice. The ref guard stops a re-render sending it again.
  const handed = useRef(false);
  useEffect(() => {
    if (handed.current) return;
    if (q) { handed.current = true; setDraft(String(q)); setTimeout(() => sendText(String(q)), 60); }
    else if (add) { handed.current = true; setTimeout(() => input.current?.focus(), 350); }
  }, [q, add]);

  const onRefresh = async () => { setRefresh(true); await fetchData(); setRefresh(false); };

  // ── The one box ─────────────────────────────────────────────────
  const send = () => sendText(draft);

  const sendText = async (raw: string) => {
    const text = raw.trim();
    if (!text || asking) return;

    setDraft('');
    setTurns((t) => [...t, { role: 'you', text }]);
    setAsking(true);
    setTimeout(() => scroller.current?.scrollTo({ y: 0, animated: true }), 50);

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
      setTimeout(() => scroller.current?.scrollTo({ y: 0, animated: true }), 50);
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
        <Text style={styles.title} numberOfLines={2}>Memories and Family Knowledge</Text>
        <View style={{ width: 18 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}>

        <View style={styles.composer}>
          <TextInput
            ref={input}
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

        <ScrollView
          ref={scroller}
          style={{ flex: 1 }}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={C.inkMid} />}>

          {turns.length === 0 && (
            <Text style={styles.hint}>
              Ask about the family, or just say what happened — “Kris got a dog in June 2019” —
              and it gets kept.
            </Text>
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

          {/* ── Things worth asking ──────────────────────────── */}
          {prompts.length > 0 && turns.length === 0 && (
            <View style={styles.bubbles}>
              {prompts.map((p) => (
                <TouchableOpacity
                  key={p}
                  style={styles.bubble}
                  onPress={() => setDraft(p)}
                  activeOpacity={0.7}>
                  <Text style={styles.bubbleText}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* ── Memory of the week ───────────────────────────── */}
          {featured && (
            <View style={styles.box}>
              <Text style={styles.boxLabel}>This Week’s Memory</Text>
              <Text style={styles.featuredBody}>{featured.body}</Text>
              <Text style={styles.featuredMeta}>
                {whenLabel(featured) || 'date unknown'}
                {featured.people.length > 0 && ` · ${featured.people.join(', ')}`}
              </Text>
              {featured.created_by === profile?.id && (
                <TouchableOpacity onPress={() => remove(featured)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.featuredX}>Remove this memory</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* ── This week last year ──────────────────────────── */}
          <View style={styles.box}>
            <Text style={styles.boxLabel}>This week last year, in photos</Text>
            {lastYear.length === 0 ? (
              <Text style={styles.emptyNote}>
                Nothing yet — the photo contest only started this September, so there is no
                last year to look back on. This fills in from next autumn.
              </Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shotRow}>
                {lastYear.map((sh) => (
                  <View key={sh.id} style={styles.shot}>
                    {sh.kind === 'video' ? (
                      <View style={[styles.shotImg, styles.shotVideo]}><Text style={styles.shotPlay}>▶︎</Text></View>
                    ) : (
                      <Image source={{ uri: sh.photo_url }} style={styles.shotImg} resizeMode="cover" />
                    )}
                    <Text style={styles.shotWho} numberOfLines={1}>{sh.profiles?.username ?? 'Someone'}</Text>
                    {!!sh.caption && <Text style={styles.shotCap} numberOfLines={2}>{sh.caption}</Text>}
                  </View>
                ))}
              </ScrollView>
            )}
          </View>

          {/* ── Family knowledge ─────────────────────────────── */}
          {people.length > 0 && (
            <View style={styles.box}>
              <Text style={styles.boxLabel}>Family Knowledge</Text>
              <Text style={styles.emptyNote}>
                The written record — where everyone lived, went to school, worked and travelled.
                Open a person to read theirs, or to add to it.
              </Text>
              <View style={styles.peopleRow}>
                {people.map((p) => (
                  <TouchableOpacity
                    key={p.name}
                    style={styles.person}
                    activeOpacity={0.8}
                    onPress={() => router.push(`/knowledge/${encodeURIComponent(p.name)}` as never)}>
                    <Text style={styles.personName}>{p.name}</Text>
                    <Text style={styles.personN}>{p.n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {loading && <Text style={styles.emptyNote}>Loading…</Text>}
        </ScrollView>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: C.bg },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
  back:        { fontSize: 32, color: C.ink, lineHeight: 34 },
  title:       { flex: 1, fontSize: 17, fontWeight: '700', color: C.ink, textAlign: 'center', paddingHorizontal: 8 },

  body:        { paddingHorizontal: 20, paddingBottom: 20, gap: 10 },

  hint:        { fontSize: 13, color: C.inkMid, lineHeight: 19, marginBottom: 4 },

  turn:        { borderRadius: 18, paddingVertical: 12, paddingHorizontal: 16, maxWidth: '88%' },
  turnYou:     { alignSelf: 'flex-end', backgroundColor: C.ink },
  turnApp:     { alignSelf: 'flex-start', backgroundColor: C.card },
  turnText:    { fontSize: 15, color: C.ink, lineHeight: 21 },
  turnTextYou: { color: '#fff' },
  savedTag:    { fontSize: 12, fontWeight: '700', color: C.green, marginTop: 6 },

  thinking:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  thinkingText:{ fontSize: 14, color: C.inkMid },

  bubbles:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  bubble:       { backgroundColor: C.card, borderRadius: 18, paddingVertical: 9, paddingHorizontal: 14, borderWidth: 1, borderColor: C.border },
  bubbleText:   { fontSize: 13, color: C.ink },

  box:          { backgroundColor: C.card, borderRadius: 18, padding: 18, marginTop: 12 },
  boxLabel:     { fontSize: 11, fontWeight: '700', color: C.accent, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  featuredBody: { fontSize: 15, color: C.ink, lineHeight: 22 },
  featuredMeta: { fontSize: 12, color: C.inkMid, marginTop: 8 },
  featuredX:    { fontSize: 12, color: C.inkDim, marginTop: 12 },
  emptyNote:    { fontSize: 13, color: C.inkMid, lineHeight: 19 },
  peopleRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  person:       { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(58,107,74,0.09)', borderRadius: 18, paddingVertical: 10, paddingHorizontal: 14 },
  personName:   { fontSize: 14, fontWeight: '700', color: C.ink },
  personN:      { fontSize: 11, fontWeight: '700', color: C.inkMid },

  shotRow:      { gap: 12, paddingRight: 4 },
  shot:         { width: 120 },
  shotImg:      { width: 120, height: 120, borderRadius: 12, backgroundColor: '#e8e2d8' },
  shotVideo:    { backgroundColor: '#1c1a16', alignItems: 'center', justifyContent: 'center' },
  shotPlay:     { fontSize: 30, color: '#fff' },
  shotWho:      { fontSize: 13, fontWeight: '700', color: C.ink, marginTop: 6 },
  shotCap:      { fontSize: 12, color: C.inkMid, marginTop: 2, lineHeight: 16 },

  composer:    { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 20, paddingTop: 2, paddingBottom: 14, backgroundColor: C.bg },
  input:       { flex: 1, minHeight: 44, maxHeight: 120, backgroundColor: C.card, borderRadius: 22, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 12, fontSize: 15, color: C.ink },
  sendBtn:     { width: 44, height: 44, borderRadius: 22, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  sendOff:     { opacity: 0.3 },
  sendText:    { fontSize: 22, color: '#fff', fontWeight: '700', lineHeight: 24 },
});
