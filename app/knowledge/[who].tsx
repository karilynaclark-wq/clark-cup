// One person's page in the family record.
//
// Everything the family has written down about them, oldest first, so
// it reads as a life rather than a feed. The box at the top adds to it:
// type what happened and it is filed under this person as family
// knowledge, with the date pulled out of the sentence.
//
// This is deliberately not the Memories screen. Nothing here is ever
// featured on the home page -- a page that contains "Dad passed away at
// 7:40pm" is a record to consult, not a thing to be shown unasked.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator,
  RefreshControl, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

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

type Entry = {
  id: string;
  body: string;
  happened_on: string | null;
  happened_text: string | null;
  people: string[];
  created_by: string | null;
  kind: 'memory' | 'knowledge';
};

// Most of the record is worded rather than dated -- "August 1983",
// "September 1974 to June 1975" -- so sorting on happened_on alone sent
// every schooling and job entry to the bottom whatever year it was.
// This reads a year, and a month where there is one, out of either, and
// sorts on that. Oldest first.
const MONTHS = ['january','february','march','april','may','june',
                'july','august','september','october','november','december'];

function yearOf(e: Entry): string {
  if (e.happened_on) return e.happened_on.slice(0, 4);
  const m = (e.happened_text ?? '').match(/\b(18|19|20)\d{2}\b/);
  return m ? m[0] : '';
}

function sortKey(e: Entry): string {
  if (e.happened_on) return e.happened_on;
  const year = yearOf(e);
  if (!year) return '9999-99-99';          // no year at all: last
  const text = (e.happened_text ?? '').toLowerCase();
  const mi = MONTHS.findIndex((name) => text.includes(name));
  return `${year}-${String(mi + 1).padStart(2, '0')}-00`;
}

function whenLabel(e: Entry): string {
  if (e.happened_on) {
    const [y, mo, d] = e.happened_on.split('-').map(Number);
    return new Date(y, mo - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
  }
  return e.happened_text ?? '';
}

export default function KnowledgePerson() {
  const router = useRouter();
  const { who } = useLocalSearchParams<{ who: string }>();
  const person = String(who ?? '');
  const { profile } = useAuth();

  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(false);
  const [draft,   setDraft]   = useState('');
  const [busy,    setBusy]    = useState(false);
  const [note,    setNote]    = useState<string | null>(null);
  const scroller = useRef<ScrollView>(null);

  const fetchData = useCallback(async () => {
    const { data } = await supabase
      .from('memories')
      .select('id, body, happened_on, happened_text, people, created_by, kind')
      .contains('people', [person])
      .order('happened_on', { ascending: true, nullsFirst: false });
    const rows = ((data ?? []) as any as Entry[])
      .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    setEntries(rows);
    setLoading(false);
  }, [person]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    setBusy(true);
    setNote(null);
    try {
      const { data, error } = await supabase.functions.invoke('memories', {
        body: { text, person },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setNote((data as any).reply);
      if ((data as any).intent === 'memory') await fetchData();
    } catch (err: any) {
      const why = String(err?.message ?? '');
      setNote(why && !why.startsWith('Edge Function')
        ? why
        : 'Something went wrong. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  const remove = (en: Entry) => {
    Alert.alert('Remove this?', en.body, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('memories').delete().eq('id', en.id);
          if (error) { Alert.alert('Could not remove that.'); return; }
          await fetchData();
        },
      },
    ]);
  };

  // Walk the list once, dropping a year heading in whenever it changes.
  const blocks: { year: string; items: Entry[] }[] = [];
  for (const en of entries) {
    const y = yearOf(en);
    const last = blocks[blocks.length - 1];
    if (last && last.year === y) last.items.push(en);
    else blocks.push({ year: y, items: [en] });
  }
  const undated = blocks.filter((b) => b.year === '');
  const dated   = blocks.filter((b) => b.year !== '');

  const render = (b: { year: string; items: Entry[] }) => (
    <View key={b.year || 'undated'} style={styles.block}>
      <Text style={styles.year}>{b.year || 'No year recorded'}</Text>
      <View style={styles.card}>
        {b.items.map((en, i) => (
          <View key={en.id} style={[styles.row, i < b.items.length - 1 && styles.rowBorder]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowBody}>{en.body}</Text>
              {!!whenLabel(en) && <Text style={styles.rowWhen}>{whenLabel(en)}</Text>}
            </View>
            {en.created_by === profile?.id && (
              <TouchableOpacity
                onPress={() => remove(en)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="Remove this">
                <Text style={styles.rowX}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{person}</Text>
        <View style={{ width: 18 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}>

        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder={`Add something about ${person}…`}
            placeholderTextColor={C.inkDim}
            multiline
            maxLength={2000}
            editable={!busy}
          />
          <TouchableOpacity
            style={[styles.go, (!draft.trim() || busy) && styles.goOff]}
            onPress={send}
            disabled={!draft.trim() || busy}
            accessibilityLabel="Add">
            {busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.goText}>↑</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView
          ref={scroller}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refresh} onRefresh={async () => { setRefresh(true); await fetchData(); setRefresh(false); }} tintColor={C.inkMid} />}>

          {note && (
            <View style={styles.note}>
              <Text style={styles.noteText}>{note}</Text>
            </View>
          )}

          <Text style={styles.count}>
            {loading
              ? 'Loading…'
              : entries.length === 0
                ? `Nothing recorded about ${person} yet`
                : `${entries.length} entries`}
          </Text>

          {dated.map(render)}
          {undated.map(render)}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
  back:      { fontSize: 32, color: C.ink, lineHeight: 34 },
  title:     { flex: 1, fontSize: 20, fontWeight: '700', color: C.ink, textAlign: 'center' },

  composer:  { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 20, paddingBottom: 14 },
  input:     { flex: 1, minHeight: 44, maxHeight: 120, backgroundColor: C.card, borderRadius: 22, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 12, fontSize: 15, color: C.ink, borderWidth: 1, borderColor: C.border },
  go:        { width: 44, height: 44, borderRadius: 22, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' },
  goOff:     { opacity: 0.3 },
  goText:    { fontSize: 20, color: '#fff', fontWeight: '700' },

  body:      { paddingHorizontal: 20, paddingBottom: 30 },
  note:      { backgroundColor: 'rgba(58,107,74,0.09)', borderRadius: 14, padding: 14, marginBottom: 14 },
  noteText:  { fontSize: 14, color: C.ink, lineHeight: 20 },
  count:     { fontSize: 12, fontWeight: '700', color: C.inkDim, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12 },

  block:     { marginBottom: 18 },
  year:      { fontSize: 13, fontWeight: '800', color: C.accent, marginBottom: 8, letterSpacing: 0.4 },
  card:      { backgroundColor: C.card, borderRadius: 16, overflow: 'hidden' },
  row:       { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(28,26,22,0.07)' },
  rowBody:   { fontSize: 15, color: C.ink, lineHeight: 21 },
  rowWhen:   { fontSize: 12, color: C.inkMid, marginTop: 4 },
  rowX:      { fontSize: 14, color: C.inkDim, paddingTop: 2 },
});
