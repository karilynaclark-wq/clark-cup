import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

// ── Design tokens ──────────────────────────────────────────────
const C = {
  bg:       '#f5f0e8',
  card:     '#ffffff',
  ink:      '#1c1a16',
  inkMid:   'rgba(28,26,22,0.5)',
  inkDim:   'rgba(28,26,22,0.3)',
  border:   'rgba(28,26,22,0.08)',
  borderMd: 'rgba(28,26,22,0.13)',
  accent:   '#d45f2e',
  accentBg: 'rgba(212,95,46,0.08)',
  green:    '#3a6b4a',
};

const PRIVACY_URL = 'https://www.notion.so/Clark-Cup-Privacy-Policy-3582a5e6a8498022a134f1aaef58b301';
const SUPPORT_URL = 'https://www.notion.so/Family-Cup-Support-3582a5e6a849801cb7c0ccd5a4780b6e';

export default function ProfileScreen() {
  const router = useRouter();
  const { profile, user, refreshProfile, signOut } = useAuth();

  const [username,        setUsername]        = useState('');
  const [address,         setAddress]         = useState('');
  const [phone,           setPhone]           = useState('');
  const [avatarUri,       setAvatarUri]       = useState<string | null>(null);
  const [saving,          setSaving]          = useState(false);
  const [deleting,        setDeleting]        = useState(false);
  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPw,      setChangingPw]      = useState(false);

  useEffect(() => {
    if (profile) {
      setUsername(profile.username ?? '');
      setAddress(profile.address ?? '');
      setPhone(profile.phone ?? '');
      setAvatarUri(profile.avatar_url ?? null);
    }
  }, [profile]);

  const pickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow photo access in Settings.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.8,
    });
    if (!result.canceled) setAvatarUri(result.assets[0].uri);
  };

  const uploadAvatar = async (uri: string): Promise<string | null> => {
    try {
      const ext = uri.split('.').pop() ?? 'jpg';
      const fileName = `avatars/${user!.id}.${ext}`;
      const arrayBuffer = await new Response(await fetch(uri)).arrayBuffer();
      const { error } = await supabase.storage
        .from('photos').upload(fileName, arrayBuffer, { contentType: `image/${ext}`, upsert: true });
      if (error) throw error;
      return supabase.storage.from('photos').getPublicUrl(fileName).data.publicUrl;
    } catch { return null; }
  };

  const handleSave = async () => {
    if (!username.trim()) { Alert.alert('Required', 'Display name cannot be empty.'); return; }
    setSaving(true);
    let avatarUrl = profile?.avatar_url ?? null;
    if (avatarUri && avatarUri !== profile?.avatar_url) {
      const uploaded = await uploadAvatar(avatarUri);
      if (uploaded) avatarUrl = uploaded;
    }
    const { error } = await supabase.from('profiles').update({
      username: username.trim(),
      address: address.trim() || null,
      phone: phone.trim() || null,
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    }).eq('id', profile!.id);
    setSaving(false);
    if (error) { Alert.alert('Error', 'Could not save changes.'); return; }
    await refreshProfile();
    Alert.alert('Saved ✓', 'Your profile has been updated.');
  };

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) { Alert.alert('Missing fields', 'Please fill in both fields.'); return; }
    if (newPassword !== confirmPassword) { Alert.alert('Mismatch', 'Passwords do not match.'); return; }
    if (newPassword.length < 6) { Alert.alert('Too short', 'Password must be at least 6 characters.'); return; }
    setChangingPw(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPw(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setNewPassword(''); setConfirmPassword('');
    Alert.alert('Password updated ✓', 'Your password has been changed.');
  };

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  };

  // Two confirmations, because this is irreversible and takes the family's
  // record of your points with it. Required by App Store guideline 5.1.1(v).
  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your account, your profile, and every point you have earned. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you sure?',
              'Your points will be removed from the leaderboard for everyone. This is permanent.',
              [
                { text: 'Keep my account', style: 'cancel' },
                {
                  text: 'Delete forever',
                  style: 'destructive',
                  onPress: async () => {
                    setDeleting(true);
                    const { data, error } = await supabase.functions.invoke('delete-account');
                    setDeleting(false);
                    if (error || (data as any)?.error) {
                      Alert.alert('Could not delete', 'Something went wrong. Please try again, or contact support.');
                      return;
                    }
                    await signOut();
                    router.replace('/(auth)/login');
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  const initials = (username || 'U').split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  const email    = profile?.email ?? user?.email ?? '—';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardDismissMode="on-drag">

          {/* ── HEADER ──────────────────────────────────── */}
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <View style={styles.logoRow}>
                <View style={styles.logoIcon}><Text style={styles.logoEmoji}>🏆</Text></View>
                <Text style={styles.logoText}>Family Cup</Text>
              </View>
              <Text style={styles.headerYear}>2026</Text>
            </View>
            <Text style={styles.pageLabel}>Account</Text>
            <Text style={styles.pageTitle}>Profile.</Text>
          </View>

          {/* ── AVATAR ──────────────────────────────────── */}
          <View style={styles.avatarWrap}>
            <TouchableOpacity onPress={pickAvatar} activeOpacity={0.85}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImg} />
              ) : (
                <View style={styles.avatarRing}>
                  <Text style={styles.avatarLetter}>{initials[0]}</Text>
                </View>
              )}
              <View style={styles.avatarEdit}><Text style={{ fontSize: 12 }}>✏️</Text></View>
            </TouchableOpacity>
            <Text style={styles.avatarHint}>Tap to change photo</Text>
          </View>

          {/* ── PROFILE INFO ────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Profile Info</Text>
            <View style={styles.formCard}>
              <Field label="Display Name">
                <TextInput
                  style={styles.fieldInput}
                  value={username}
                  onChangeText={setUsername}
                  placeholder="Your name"
                  placeholderTextColor={C.inkDim}
                />
              </Field>
              <Field label="Address">
                <TextInput
                  style={styles.fieldInput}
                  value={address}
                  onChangeText={setAddress}
                  placeholder="123 Main St, City, State"
                  placeholderTextColor={C.inkDim}
                  autoCorrect={false}
                />
              </Field>
              <Field label="Phone">
                <TextInput
                  style={styles.fieldInput}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="(555) 000-0000"
                  placeholderTextColor={C.inkDim}
                  keyboardType="phone-pad"
                />
              </Field>
              <Field label="Email" last>
                <Text style={styles.fieldValueStatic}>{email}</Text>
              </Field>
            </View>
          </View>

          <View style={styles.btnWrap}>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving} activeOpacity={0.8}>
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.saveBtnText}>Save Changes</Text>}
            </TouchableOpacity>
          </View>

          {/* ── CHANGE PASSWORD ──────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Change Password</Text>
            <View style={styles.formCard}>
              <Field label="New Password">
                <TextInput
                  style={styles.fieldInput}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="At least 6 characters"
                  placeholderTextColor={C.inkDim}
                  secureTextEntry
                />
              </Field>
              <Field label="Confirm Password" last>
                <TextInput
                  style={styles.fieldInput}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Re-enter new password"
                  placeholderTextColor={C.inkDim}
                  secureTextEntry
                />
              </Field>
            </View>
          </View>

          <View style={styles.btnWrap}>
            <TouchableOpacity style={styles.outlineBtn} onPress={handleChangePassword} disabled={changingPw} activeOpacity={0.8}>
              {changingPw
                ? <ActivityIndicator color={C.ink} />
                : <Text style={styles.outlineBtnText}>Update Password</Text>}
            </TouchableOpacity>
          </View>

          {/* ── SIGN OUT ─────────────────────────────────── */}
          <View style={[styles.btnWrap, { paddingTop: 20, paddingBottom: 8 }]}>
            <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} activeOpacity={0.8}>
              <Text style={styles.signOutText}>Sign Out</Text>
            </TouchableOpacity>
          </View>

          {/* ── DELETE ACCOUNT ───────────────────────────── */}
          <View style={[styles.btnWrap, { paddingTop: 4, paddingBottom: 8 }]}>
            <TouchableOpacity onPress={handleDeleteAccount} disabled={deleting} activeOpacity={0.7}>
              <Text style={styles.deleteText}>
                {deleting ? 'Deleting…' : 'Delete Account'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── LEGAL FOOTER ─────────────────────────────── */}
          <View style={styles.legalRow}>
            <TouchableOpacity onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.legalLink}>Privacy Policy</Text>
            </TouchableOpacity>
            <Text style={styles.legalDot}>·</Text>
            <TouchableOpacity onPress={() => WebBrowser.openBrowserAsync(SUPPORT_URL)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.legalLink}>Support</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Field helper component ─────────────────────────────────────
function Field({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <View style={[fieldStyles.row, !last && fieldStyles.border]}>
      <Text style={fieldStyles.label}>{label}</Text>
      {children}
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  row:    { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 10 },
  border: { borderBottomWidth: 1, borderBottomColor: 'rgba(28,26,22,0.08)' },
  label:  { fontSize: 9, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(28,26,22,0.3)', marginBottom: 5 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scroll:    { paddingBottom: 48 },

  // Header
  header:     { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 20 },
  headerTop:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  logoRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoIcon:   { width: 30, height: 30, backgroundColor: C.ink, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  logoEmoji:  { fontSize: 15 },
  logoText:   { fontSize: 15, fontWeight: '600', color: C.ink },
  headerYear: { fontSize: 13, fontWeight: '500', color: C.inkMid },
  pageLabel:  { fontSize: 13, fontWeight: '500', color: C.inkMid, marginBottom: 2 },
  pageTitle:  { fontSize: 52, fontWeight: '400', lineHeight: 48, letterSpacing: -1.5, color: C.ink, fontStyle: 'italic' },

  // Avatar
  avatarWrap:   { alignItems: 'center', paddingTop: 4, paddingBottom: 4, marginBottom: 4 },
  avatarRing:   { width: 86, height: 86, borderRadius: 43, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center', shadowColor: C.green, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  avatarImg:    { width: 86, height: 86, borderRadius: 43 },
  avatarLetter: { fontSize: 38, color: '#fff', fontStyle: 'italic' },
  avatarEdit:   { position: 'absolute', bottom: 2, right: 2, width: 26, height: 26, backgroundColor: '#fff', borderRadius: 13, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 3 },
  avatarHint:   { marginTop: 10, fontSize: 11, fontWeight: '500', color: C.inkDim, letterSpacing: 0.2 },

  // Sections
  section:      { paddingHorizontal: 20, paddingTop: 20 },
  sectionLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: C.inkDim, marginBottom: 10 },

  // Form card
  formCard: { backgroundColor: C.card, borderRadius: 22, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },

  // Field inputs (inside the card rows)
  fieldInput:       { fontSize: 16, fontWeight: '500', color: C.ink, paddingVertical: 2 },
  fieldValueStatic: { fontSize: 14, fontWeight: '500', color: C.ink },

  // Buttons
  btnWrap:       { paddingHorizontal: 20, paddingTop: 12 },
  saveBtn:       { backgroundColor: C.ink, borderRadius: 22, paddingVertical: 17, alignItems: 'center' },
  saveBtnText:   { color: '#fff', fontSize: 15, fontWeight: '600', letterSpacing: 0.1 },
  outlineBtn:    { borderRadius: 22, paddingVertical: 16, alignItems: 'center', borderWidth: 1.5, borderColor: C.borderMd },
  outlineBtnText:{ color: C.ink, fontSize: 15, fontWeight: '600' },
  signOutBtn:    { borderRadius: 22, paddingVertical: 16, alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(212,95,46,0.25)' },
  signOutText:   { color: C.accent, fontSize: 14, fontWeight: '600', letterSpacing: 0.1 },
  deleteText:    { color: '#b3261e', fontSize: 13, fontWeight: '500', textAlign: 'center', paddingVertical: 12 },

  // Legal footer
  legalRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, paddingTop: 24, paddingBottom: 4 },
  legalLink: { fontSize: 11, color: C.inkDim },
  legalDot:  { fontSize: 11, color: C.inkDim },
});
