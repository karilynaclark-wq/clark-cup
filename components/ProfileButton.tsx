import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';

// Profile moved off the tab bar, so every page carries the way into it.
// Shows your picture if you have set one, otherwise your initials.
export default function ProfileButton() {
  const router = useRouter();
  const { profile } = useAuth();

  const name = (profile as any)?.first_name ?? profile?.username ?? '';
  const last = (profile as any)?.last_name ?? '';
  const initials =
    `${name.trim()[0] ?? ''}${last.trim()[0] ?? ''}`.toUpperCase()
    || (name.trim()[0] ?? '?').toUpperCase();

  return (
    <TouchableOpacity
      onPress={() => router.push('/(tabs)/profile')}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityLabel="Your profile"
      activeOpacity={0.8}
    >
      {profile?.avatar_url ? (
        <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
      ) : (
        <Text style={[styles.avatar, styles.initials]}>{initials}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#3a6b4a',
  },
  initials: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 34,
    overflow: 'hidden',
  },
});
