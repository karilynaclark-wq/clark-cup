import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  RefreshControl,
  Image,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { supabase, PointSubmission, Profile } from '@/lib/supabase';
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

const PERSON_COLORS: Record<string, string> = {
  Kris:  '#d45f2e',
  Kari:  '#3a6b4a',
  Mom:   '#7a6abf',
  Kelly: '#c4860a',
  Kyle:  '#2a7fa5',
};
const FALLBACK_COLORS = ['#d45f2e','#3a6b4a','#7a6abf','#c4860a','#2a7fa5','#b45a7a'];
function personColor(name: string) {
  return PERSON_COLORS[name] ?? FALLBACK_COLORS[Math.abs(name.charCodeAt(0)) % FALLBACK_COLORS.length];
}

const CATEGORY_LABELS: Record<string, string> = {
  sunday_call:   'Sunday Call',
  weekly_photo:  'Photo Contest',
  board_game:    'Board Game Night',
  recipe:        'Recipe Share',
  miscellaneous: 'Miscellaneous',
};

type ActivityItem = PointSubmission & { profiles?: { username: string; avatar_url: string | null } };

type FlatRow =
  | { type: 'dateHeader'; label: string; id: string }
  | { type: 'row'; item: ActivityItem; isLast: boolean; isFirst: boolean };

function buildFlatList(items: ActivityItem[]): FlatRow[] {
  const rows: FlatRow[] = [];
  let lastDate = '';
  let groupItems: ActivityItem[] = [];

  const flush = () => {
    groupItems.forEach((it, idx) => {
      rows.push({ type: 'row', item: it, isFirst: idx === 0, isLast: idx === groupItems.length - 1 });
    });
    groupItems = [];
  };

  for (const item of items) {
    const label = new Date(item.submitted_at).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
    if (label !== lastDate) {
      flush();
      rows.push({ type: 'dateHeader', label, id: `header-${label}` });
      lastDate = label;
    }
    groupItems.push(item);
  }
  flush();
  return rows;
}

export default function PointsScreen() {
  const { profile: myProfile, user, refreshProfile } = useAuth();
  const [flatRows,   setFlatRows]   = useState<FlatRow[]>([]);
  const [profiles,   setProfiles]   = useState<Profile[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Quick add modals
  const [sundayModal,    setSundayModal]    = useState(false);
  const [photoModal,     setPhotoModal]     = useState(false);
  const [submitModal,    setSubmitModal]    = useState(false);
  const [boardGameModal, setBoardGameModal] = useState(false);
  const [recipeModal,    setRecipeModal]    = useState(false);

  // Sunday Call state
  const [selectedUsers,    setSelectedUsers]    = useState<Set<string>>(new Set());
  const [submittingSunday, setSubmittingSunday] = useState(false);

  // Photo Contest state
  const [photoWinner,      setPhotoWinner]      = useState<string | null>(null);
  const [contestPhotoUri,  setContestPhotoUri]  = useState<string | null>(null);
  const [submittingPhoto,  setSubmittingPhoto]  = useState(false);

  // Custom submit state
  const [customName,   setCustomName]   = useState('');
  const [customPoints, setCustomPoints] = useState('');
  const [notes,        setNotes]        = useState('');
  const [photoUri,     setPhotoUri]     = useState<string | null>(null);
  const [submitting,   setSubmitting]   = useState(false);

  const fetchData = useCallback(async () => {
    const [{ data: acts }, { data: profs }] = await Promise.all([
      supabase
        .from('point_submissions')
        .select('*, profiles(username, avatar_url)')
        .order('submitted_at', { ascending: false }),
      supabase.from('profiles').select('*').order('username'),
    ]);
    if (acts)  setFlatRows(buildFlatList(acts as ActivityItem[]));
    if (profs) setProfiles(profs as Profile[]);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchData(), refreshProfile()]);
    setRefreshing(false);
  };

  const getInitials = (name: string) =>
    name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  // ── Photo helpers ─────────────────────────────────────────────
  const pickPhoto = async (setter: (uri: string) => void) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow photo access.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [4, 3], quality: 0.7,
    });
    if (!result.canceled) setter(result.assets[0].uri);
  };

  const uploadPhoto = async (uri: string, folder = 'submissions'): Promise<string | null> => {
    try {
      const ext = uri.split('.').pop() ?? 'jpg';
      const fileName = `${folder}/${Date.now()}.${ext}`;
      const arrayBuffer = await new Response(await fetch(uri)).arrayBuffer();
      const { error } = await supabase.storage
        .from('photos').upload(fileName, arrayBuffer, { contentType: `image/${ext}` });
      if (error) throw error;
      return supabase.storage.from('photos').getPublicUrl(fileName).data.publicUrl;
    } catch { return null; }
  };

  // ── Sunday Call ───────────────────────────────────────────────
  const handleSundaySubmit = async () => {
    if (selectedUsers.size === 0) { Alert.alert('Select at least one person'); return; }
    setSubmittingSunday(true);
    const rows = Array.from(selectedUsers).map((uid) => ({ user_id: uid, category: 'sunday_call', points: 50, family_id: myProfile?.family_id }));
    const { error } = await supabase.from('point_submissions').insert(rows);
    setSubmittingSunday(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setSundayModal(false); setSelectedUsers(new Set());
    await Promise.all([fetchData(), refreshProfile()]);
  };

  // ── Photo Contest ─────────────────────────────────────────────
  const handlePhotoContestSubmit = async () => {
    if (!photoWinner) { Alert.alert('Pick a winner first'); return; }
    setSubmittingPhoto(true);
    let photoUrl: string | null = null;
    if (contestPhotoUri) photoUrl = await uploadPhoto(contestPhotoUri, 'photo-contest');
    const { error } = await supabase.from('point_submissions').insert({
      user_id: photoWinner, category: 'weekly_photo', points: 100, photo_url: photoUrl,
      family_id: myProfile?.family_id,
    });
    setSubmittingPhoto(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setPhotoModal(false); setPhotoWinner(null); setContestPhotoUri(null);
    await Promise.all([fetchData(), refreshProfile()]);
  };

  // ── Board Game Night ─────────────────────────────────────────
  const [selectedBoardGameUsers, setSelectedBoardGameUsers] = useState<Set<string>>(new Set());
  const [submittingBoardGame, setSubmittingBoardGame] = useState(false);
  const handleBoardGameSubmit = async () => {
    if (selectedBoardGameUsers.size === 0) { Alert.alert('Select at least one person'); return; }
    setSubmittingBoardGame(true);
    const rows = Array.from(selectedBoardGameUsers).map((uid) => ({ user_id: uid, category: 'board_game', points: 10, family_id: myProfile?.family_id }));
    const { error } = await supabase.from('point_submissions').insert(rows);
    setSubmittingBoardGame(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setBoardGameModal(false); setSelectedBoardGameUsers(new Set());
    await Promise.all([fetchData(), refreshProfile()]);
  };

  // ── Recipe Share ──────────────────────────────────────────────
  const [selectedRecipeUsers, setSelectedRecipeUsers] = useState<Set<string>>(new Set());
  const [submittingRecipe, setSubmittingRecipe] = useState(false);
  const handleRecipeSubmit = async () => {
    if (selectedRecipeUsers.size === 0) { Alert.alert('Select at least one person'); return; }
    setSubmittingRecipe(true);
    const rows = Array.from(selectedRecipeUsers).map((uid) => ({ user_id: uid, category: 'recipe', points: 30, family_id: myProfile?.family_id }));
    const { error } = await supabase.from('point_submissions').insert(rows);
    setSubmittingRecipe(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setRecipeModal(false); setSelectedRecipeUsers(new Set());
    await Promise.all([fetchData(), refreshProfile()]);
  };

  // ── Custom submit ─────────────────────────────────────────────
  const resetForm = () => { setCustomName(''); setCustomPoints(''); setNotes(''); setPhotoUri(null); };

  const handleSubmit = async () => {
    if (!myProfile) return;
    const pts = parseInt(customPoints, 10);
    if (!customName.trim()) { Alert.alert('Missing info', 'Please enter an activity name.'); return; }
    if (isNaN(pts) || pts <= 0) { Alert.alert('Invalid points', 'Enter a valid point amount > 0.'); return; }
    setSubmitting(true);
    let photoUrl: string | null = null;
    if (photoUri) photoUrl = await uploadPhoto(photoUri);
    const { error } = await supabase.from('point_submissions').insert({
      user_id: myProfile.id, category: 'miscellaneous', family_id: myProfile?.family_id,
      custom_name: customName.trim(), points: pts,
      photo_url: photoUrl, notes: notes.trim() || null,
    });
    setSubmitting(false);
    if (error) { Alert.alert('Error', 'Could not submit points.'); return; }
    setSubmitModal(false); resetForm();
    await Promise.all([fetchData(), refreshProfile()]);
  };

  // ── Render ────────────────────────────────────────────────────
  const renderRow = ({ item: row }: { item: FlatRow }) => {
    if (row.type === 'dateHeader') {
      return (
        <View style={styles.dateHeader}>
          <Text style={styles.dateHeaderText}>{row.label}</Text>
        </View>
      );
    }
    const { item, isLast } = row;
    const name  = item.profiles?.username ?? 'Someone';
    const label = item.category === 'miscellaneous' && item.custom_name
      ? item.custom_name : CATEGORY_LABELS[item.category];
    return (
      <View style={[styles.actRow, !isLast && styles.actBorder]}>
        <View style={[styles.actDot, { backgroundColor: personColor(name) }]} />
        <View style={styles.actInfo}>
          <Text style={styles.actName}>{name}</Text>
          <Text style={styles.actReason}>{label}</Text>
          {item.photo_url
            ? <Image source={{ uri: item.photo_url }} style={styles.actPhoto} resizeMode="cover" />
            : null}
        </View>
        <Text style={styles.actPts}>+{item.points}</Text>
      </View>
    );
  };

  const ListHeader = (
    <View>
      {/* Page header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.logoRow}>
            <View style={styles.logoIcon}><Text style={styles.logoEmoji}>🏆</Text></View>
            <Text style={styles.logoText}>Family Cup</Text>
          </View>
          <Text style={styles.headerYear}>2026</Text>
        </View>
        <Text style={styles.pageLabel}>Activity</Text>
        <Text style={styles.pageTitle}>Points.</Text>
      </View>

      {/* Quick Add */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Quick Add</Text>
        <View style={styles.quickGrid}>
          <TouchableOpacity style={styles.quickCard} onPress={() => setSundayModal(true)} activeOpacity={0.75}>
            <Text style={styles.quickEmoji}>📞</Text>
            <Text style={styles.quickName}>Sunday Call</Text>
            <Text style={styles.quickPts}>+50 each</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickCard} onPress={() => setPhotoModal(true)} activeOpacity={0.75}>
            <Text style={styles.quickEmoji}>📸</Text>
            <Text style={styles.quickName}>Photo Contest</Text>
            <Text style={styles.quickPts}>+100 winner</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickCard} onPress={() => setBoardGameModal(true)} activeOpacity={0.75}>
            <Text style={styles.quickEmoji}>🎲</Text>
            <Text style={styles.quickName}>Game Night</Text>
            <Text style={styles.quickPts}>+10 each</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickCard} onPress={() => setRecipeModal(true)} activeOpacity={0.75}>
            <Text style={styles.quickEmoji}>🍳</Text>
            <Text style={styles.quickName}>Recipe Share</Text>
            <Text style={styles.quickPts}>+30 each</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Submit button */}
      <View style={styles.submitWrap}>
        <TouchableOpacity style={styles.submitBtn} onPress={() => setSubmitModal(true)} activeOpacity={0.8}>
          <Text style={styles.submitBtnText}>+ Submit Points</Text>
        </TouchableOpacity>
      </View>

      {/* Activity header */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>All Activity</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />

      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
      >
        {ListHeader}
        <View style={styles.activityCard}>
          {flatRows.length === 0 ? (
            <View style={styles.actRow}>
              <Text style={styles.emptyText}>No activity yet — be the first to score!</Text>
            </View>
          ) : (
            flatRows.map((row) => {
              const key = row.type === 'dateHeader' ? row.id : row.item.id;
              return <View key={key}>{renderRow({ item: row })}</View>;
            })
          )}
        </View>
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* ── Sunday Call Modal ─────────────────────────────── */}
      <Modal visible={sundayModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSundayModal(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => { setSundayModal(false); setSelectedUsers(new Set()); }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>📞 Sunday Call</Text>
            <TouchableOpacity onPress={handleSundaySubmit} disabled={submittingSunday}>
              {submittingSunday ? <ActivityIndicator color={C.accent} /> : <Text style={styles.modalDone}>Add +50</Text>}
            </TouchableOpacity>
          </View>
          <Text style={styles.modalSubtitle}>Who joined the call?</Text>
          <ScrollView contentContainerStyle={styles.modalScroll} keyboardDismissMode="on-drag">
            {profiles.map((p) => {
              const selected = selectedUsers.has(p.id);
              return (
                <TouchableOpacity key={p.id} style={[styles.personRow, selected && styles.personRowSelected]}
                  onPress={() => { const next = new Set(selectedUsers); selected ? next.delete(p.id) : next.add(p.id); setSelectedUsers(next); }}>
                  <View style={[styles.personDot, { backgroundColor: personColor(p.username) }]} />
                  <Text style={[styles.personName, selected && styles.personNameSelected]}>{p.username}</Text>
                  <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                    {selected && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Modal>

      {/* ── Photo Contest Modal ───────────────────────────── */}
      <Modal visible={photoModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPhotoModal(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => { setPhotoModal(false); setPhotoWinner(null); setContestPhotoUri(null); }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>📸 Photo Contest</Text>
            <TouchableOpacity onPress={handlePhotoContestSubmit} disabled={submittingPhoto}>
              {submittingPhoto ? <ActivityIndicator color={C.accent} /> : <Text style={styles.modalDone}>Add +100</Text>}
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalScroll}>
            <Text style={styles.formLabel}>Winner</Text>
            {profiles.map((p) => {
              const selected = photoWinner === p.id;
              return (
                <TouchableOpacity key={p.id} style={[styles.personRow, selected && styles.personRowSelected]}
                  onPress={() => setPhotoWinner(p.id)}>
                  <View style={[styles.personDot, { backgroundColor: personColor(p.username) }]} />
                  <Text style={[styles.personName, selected && styles.personNameSelected]}>{p.username}</Text>
                  <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                    {selected && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
            <Text style={styles.formLabel}>Winning Photo (optional)</Text>
            <TouchableOpacity style={styles.photoButton} onPress={() => pickPhoto(setContestPhotoUri)}>
              {contestPhotoUri
                ? <Image source={{ uri: contestPhotoUri }} style={styles.photoPreview} />
                : <View style={styles.photoPlaceholder}><Text style={styles.photoIcon}>📷</Text><Text style={styles.photoText}>Tap to attach</Text></View>}
            </TouchableOpacity>
            {contestPhotoUri && <TouchableOpacity onPress={() => setContestPhotoUri(null)} style={styles.removePhotoBtn}><Text style={styles.removePhoto}>Remove photo</Text></TouchableOpacity>}
          </ScrollView>
        </View>
      </Modal>

      {/* ── Custom Submit Modal ───────────────────────────── */}
      <Modal visible={submitModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSubmitModal(false)}>
        <KeyboardAvoidingView style={styles.modalContainer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => { setSubmitModal(false); resetForm(); }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Submit Points</Text>
            <TouchableOpacity onPress={handleSubmit} disabled={submitting}>
              {submitting ? <ActivityIndicator color={C.accent} /> : <Text style={styles.modalDone}>Submit</Text>}
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            <Text style={styles.formLabel}>Activity Name</Text>
            <TextInput style={styles.input} value={customName} onChangeText={setCustomName}
              placeholder="e.g. Cooked a family recipe" placeholderTextColor={C.inkDim} />
            <Text style={styles.formLabel}>Points</Text>
            <TextInput style={styles.input} value={customPoints} onChangeText={setCustomPoints}
              placeholder="e.g. 25" placeholderTextColor={C.inkDim} keyboardType="number-pad" />
            <Text style={styles.formLabel}>Notes (optional)</Text>
            <TextInput style={[styles.input, styles.inputMulti]} value={notes} onChangeText={setNotes}
              placeholder="Add a note..." placeholderTextColor={C.inkDim} multiline numberOfLines={3} />
            <Text style={styles.formLabel}>Photo (optional)</Text>
            <TouchableOpacity style={styles.photoButton} onPress={() => pickPhoto(setPhotoUri)}>
              {photoUri
                ? <Image source={{ uri: photoUri }} style={styles.photoPreview} />
                : <View style={styles.photoPlaceholder}><Text style={styles.photoIcon}>📷</Text><Text style={styles.photoText}>Tap to attach a photo</Text></View>}
            </TouchableOpacity>
            {photoUri && <TouchableOpacity onPress={() => setPhotoUri(null)} style={styles.removePhotoBtn}><Text style={styles.removePhoto}>Remove photo</Text></TouchableOpacity>}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Board Game Night Modal ────────────────────────── */}
      <Modal visible={boardGameModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setBoardGameModal(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => { setBoardGameModal(false); setSelectedBoardGameUsers(new Set()); }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>🎲 Board Game Night</Text>
            <TouchableOpacity onPress={handleBoardGameSubmit} disabled={submittingBoardGame}>
              {submittingBoardGame ? <ActivityIndicator color={C.accent} /> : <Text style={styles.modalDone}>Add +10</Text>}
            </TouchableOpacity>
          </View>
          <Text style={styles.modalSubtitle}>Who played?</Text>
          <ScrollView contentContainerStyle={styles.modalScroll} keyboardDismissMode="on-drag">
            {profiles.map((p) => {
              const selected = selectedBoardGameUsers.has(p.id);
              return (
                <TouchableOpacity key={p.id} style={[styles.personRow, selected && styles.personRowSelected]}
                  onPress={() => { const next = new Set(selectedBoardGameUsers); selected ? next.delete(p.id) : next.add(p.id); setSelectedBoardGameUsers(next); }}>
                  <View style={[styles.personDot, { backgroundColor: personColor(p.username) }]} />
                  <Text style={[styles.personName, selected && styles.personNameSelected]}>{p.username}</Text>
                  <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                    {selected && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Modal>

      {/* ── Recipe Share Modal ───────────────────────────────── */}
      <Modal visible={recipeModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setRecipeModal(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => { setRecipeModal(false); setSelectedRecipeUsers(new Set()); }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>🍳 Recipe Share</Text>
            <TouchableOpacity onPress={handleRecipeSubmit} disabled={submittingRecipe}>
              {submittingRecipe ? <ActivityIndicator color={C.accent} /> : <Text style={styles.modalDone}>Add +30</Text>}
            </TouchableOpacity>
          </View>
          <Text style={styles.modalSubtitle}>Who shared a recipe?</Text>
          <ScrollView contentContainerStyle={styles.modalScroll} keyboardDismissMode="on-drag">
            {profiles.map((p) => {
              const selected = selectedRecipeUsers.has(p.id);
              return (
                <TouchableOpacity key={p.id} style={[styles.personRow, selected && styles.personRowSelected]}
                  onPress={() => { const next = new Set(selectedRecipeUsers); selected ? next.delete(p.id) : next.add(p.id); setSelectedRecipeUsers(next); }}>
                  <View style={[styles.personDot, { backgroundColor: personColor(p.username) }]} />
                  <Text style={[styles.personName, selected && styles.personNameSelected]}>{p.username}</Text>
                  <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                    {selected && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  list:      { paddingBottom: 48 },

  // Header
  header:      { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 20 },
  headerTop:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  logoRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoIcon:    { width: 30, height: 30, backgroundColor: C.ink, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  logoEmoji:   { fontSize: 15 },
  logoText:    { fontSize: 15, fontWeight: '600', color: C.ink },
  headerYear:  { fontSize: 13, fontWeight: '500', color: C.inkMid },
  pageLabel:   { fontSize: 13, fontWeight: '500', color: C.inkMid, marginBottom: 2 },
  pageTitle:   { fontSize: 52, fontWeight: '400', lineHeight: 48, letterSpacing: -1.5, color: C.ink, fontStyle: 'italic' },

  // Sections
  section:      { paddingHorizontal: 20, paddingTop: 20 },
  sectionLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: C.inkDim, marginBottom: 10 },

  // Quick Add
  quickGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickCard:     { width: '48%', flexShrink: 0, backgroundColor: C.card, borderRadius: 18, padding: 16, alignItems: 'flex-start', gap: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  quickEmoji:    { fontSize: 22, lineHeight: 26 },
  quickName:     { fontSize: 15, fontWeight: '600', color: C.ink },
  quickPts:      { fontSize: 13, fontWeight: '500', color: C.green },

  // Submit button
  submitWrap:    { paddingHorizontal: 20, paddingTop: 14 },
  submitBtn:     { backgroundColor: C.ink, borderRadius: 22, paddingVertical: 17, alignItems: 'center' },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '600', letterSpacing: 0.1 },

  // Activity list
  activityCard: { backgroundColor: C.card, borderRadius: 22, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3, marginHorizontal: 20 },
  dateHeader:   { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 6, backgroundColor: 'rgba(28,26,22,0.02)', borderBottomWidth: 1, borderBottomColor: C.border },
  dateHeaderText:{ fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: C.inkDim },
  actRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 13, backgroundColor: C.card },
  actBorder:    { borderBottomWidth: 1, borderBottomColor: C.border },
  actDot:       { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  actInfo:      { flex: 1 },
  actName:      { fontSize: 14, fontWeight: '600', color: C.ink },
  actReason:    { fontSize: 12, color: C.inkMid, marginTop: 1, fontStyle: 'italic' },
  actPhoto:     { width: '100%', height: 140, borderRadius: 8, marginTop: 8 },
  actPts:       { fontSize: 18, color: C.greenLt, letterSpacing: -0.3, fontStyle: 'italic' },
  emptyText:    { flex: 1, fontSize: 13, color: C.inkMid, textAlign: 'center', paddingVertical: 4 },

  // Modals
  modalContainer: { flex: 1, backgroundColor: C.card },
  modalHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  modalCancel:    { fontSize: 16, color: C.inkMid },
  modalTitle:     { fontSize: 17, fontWeight: '700', color: C.ink },
  modalDone:      { fontSize: 16, fontWeight: '700', color: C.accent },
  modalSubtitle:  { fontSize: 14, color: C.inkMid, paddingHorizontal: 20, paddingTop: 12 },
  modalScroll:    { padding: 20, paddingBottom: 40 },
  formLabel:      { fontSize: 11, fontWeight: '600', color: C.inkDim, marginBottom: 8, marginTop: 20, textTransform: 'uppercase', letterSpacing: 0.8 },

  // Person picker
  personRow:         { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.bg, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1.5, borderColor: 'transparent' },
  personRowSelected: { borderColor: C.green, backgroundColor: C.greenBg },
  personDot:         { width: 10, height: 10, borderRadius: 5 },
  personName:        { flex: 1, fontSize: 16, fontWeight: '600', color: C.ink },
  personNameSelected:{ color: C.green },
  checkbox:          { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: 'rgba(28,26,22,0.2)', alignItems: 'center', justifyContent: 'center' },
  checkboxSelected:  { backgroundColor: C.green, borderColor: C.green },
  checkmark:         { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Form inputs
  input:          { backgroundColor: C.bg, borderRadius: 12, padding: 14, fontSize: 16, color: C.ink, borderWidth: 1, borderColor: 'rgba(28,26,22,0.1)' },
  inputMulti:     { height: 80, textAlignVertical: 'top' },
  photoButton:    { borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(28,26,22,0.15)', borderStyle: 'dashed' },
  photoPlaceholder:{ height: 100, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg, gap: 8 },
  photoIcon:      { fontSize: 28 },
  photoText:      { color: C.inkMid, fontSize: 13 },
  photoPreview:   { width: '100%', height: 180 },
  removePhotoBtn: { paddingVertical: 12, alignItems: 'center' },
  removePhoto:    { color: '#EF4444', fontSize: 13 },
});
