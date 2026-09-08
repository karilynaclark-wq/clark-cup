import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { COLORS } from '@/constants/Colors';

export default function SignupScreen() {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const [mode, setMode] = useState<'join' | 'create'>('join');
  const [joinCode, setJoinCode] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!username || !email || !password || !confirm) {
      Alert.alert('Missing fields', 'Please fill in all fields.');
      return;
    }
    if (mode === 'join' && !joinCode.trim()) {
      Alert.alert('Family code needed', 'Enter the code from whoever invited you, or start a new family instead.');
      return;
    }
    if (mode === 'create' && !familyName.trim()) {
      Alert.alert('Family name needed', 'What should your family be called?');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Password mismatch', 'Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Weak password', 'Password must be at least 6 characters.');
      return;
    }

    setLoading(true);

    // Resolve the family first: no point creating a login that cannot be
    // attached to anything.
    let familyId: string | null = null;
    if (mode === 'join') {
      const { data: found, error: codeErr } = await supabase
        .rpc('family_id_for_code', { code: joinCode.trim() });
      if (codeErr || !found) {
        setLoading(false);
        Alert.alert('Code not recognized', 'Double-check the code with whoever invited you.');
        return;
      }
      familyId = found as string;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } },
    });

    if (error) {
      setLoading(false);
      Alert.alert('Sign up failed', error.message);
      return;
    }

    if (data.user) {
      // Starting a new family: create it now that we know the login exists.
      if (mode === 'create') {
        // An RPC, not an insert: the new family is not yours until your
        // profile points at it, so reading back its id is otherwise refused.
        const { data: newFamilyId, error: famErr } = await supabase
          .rpc('create_family', { family_name: familyName.trim() });
        if (famErr || !newFamilyId) {
          setLoading(false);
          Alert.alert('Sign up failed', famErr?.message ?? 'Could not create your family.');
          return;
        }
        familyId = newFamilyId as string;
      }

      // Check if there's an existing placeholder profile with this username
      // (for family members who have historical data but haven't signed up yet)
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', username.trim())
        .eq('family_id', familyId)
        .is('auth_user_id', null)
        .maybeSingle();

      if (existingProfile) {
        // Claim the existing profile — link it to this auth account
        const { error: claimError } = await supabase
          .from('profiles')
          .update({ auth_user_id: data.user.id, email: email.trim().toLowerCase() })
          .eq('id', existingProfile.id);
        if (claimError) {
          setLoading(false);
          Alert.alert('Sign up failed', claimError.message);
          return;
        }
      } else {
        // No existing profile — create a fresh one
        const { error: profileError } = await supabase.from('profiles').insert({
          auth_user_id: data.user.id,
          username: username.trim(),
          email: email.trim().toLowerCase(),
          family_id: familyId,
        });
        if (profileError) {
          setLoading(false);
          Alert.alert('Sign up failed', profileError.message);
          return;
        }
      }
    }

    await refreshProfile();
    setLoading(false);
    Alert.alert(
      'Welcome to Family Cup!',
      'Your account has been created.',
      [{ text: "Let's go!", onPress: () => router.replace('/(tabs)') }]
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <View style={styles.header}>
          <Text style={styles.trophy}>🏆</Text>
          <Text style={styles.title}>Join Family Cup</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.segment}>
            <TouchableOpacity
              style={[styles.segmentBtn, mode === 'join' && styles.segmentBtnOn]}
              onPress={() => setMode('join')}>
              <Text style={[styles.segmentText, mode === 'join' && styles.segmentTextOn]}>
                Join a family
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segmentBtn, mode === 'create' && styles.segmentBtnOn]}
              onPress={() => setMode('create')}>
              <Text style={[styles.segmentText, mode === 'create' && styles.segmentTextOn]}>
                Start a new one
              </Text>
            </TouchableOpacity>
          </View>

          {mode === 'join' ? (
            <>
              <Text style={styles.label}>Family Code</Text>
              <TextInput
                style={styles.input}
                value={joinCode}
                onChangeText={(t) => setJoinCode(t.toUpperCase())}
                placeholder="6-letter code"
                placeholderTextColor={COLORS.textSecondary}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={6}
              />
              <Text style={styles.hint}>Ask whoever invited you — it's on their Profile screen.</Text>
            </>
          ) : (
            <>
              <Text style={styles.label}>Family Name</Text>
              <TextInput
                style={styles.input}
                value={familyName}
                onChangeText={setFamilyName}
                placeholder="e.g. The Clarks"
                placeholderTextColor={COLORS.textSecondary}
                autoCorrect={false}
              />
              <Text style={styles.hint}>You'll get a code to invite everyone else.</Text>
            </>
          )}

          <Text style={styles.label}>Display Name</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="e.g. Kari Clark"
            placeholderTextColor={COLORS.textSecondary}
            autoCorrect={false}
          />

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={COLORS.textSecondary}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="At least 6 characters"
            placeholderTextColor={COLORS.textSecondary}
            secureTextEntry
          />

          <Text style={styles.label}>Confirm Password</Text>
          <TextInput
            style={styles.input}
            value={confirm}
            onChangeText={setConfirm}
            placeholder="••••••••"
            placeholderTextColor={COLORS.textSecondary}
            secureTextEntry
          />

          <TouchableOpacity style={styles.button} onPress={handleSignup} disabled={loading}>
            {loading ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={styles.buttonText}>Create Account</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primary,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 36,
  },
  trophy: {
    fontSize: 48,
    marginBottom: 10,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: COLORS.white,
  },
  form: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 9,
    alignItems: 'center',
  },
  segmentBtnOn: {
    backgroundColor: COLORS.primary,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  segmentTextOn: {
    color: COLORS.white,
  },
  hint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: -10,
    marginBottom: 16,
    lineHeight: 17,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: COLORS.text,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
  },
});
