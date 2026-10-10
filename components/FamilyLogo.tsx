import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';

// The family's own photo where the trophy tile used to be. Falls back to
// the trophy until someone sets one.
export default function FamilyLogo({ size = 30 }: { size?: number }) {
  const { familyPhoto } = useAuth();
  const radius = size <= 32 ? 8 : 12;

  if (familyPhoto) {
    return (
      <Image
        source={{ uri: familyPhoto }}
        style={{ width: size, height: size, borderRadius: radius, backgroundColor: '#e8e2d8' }}
      />
    );
  }
  return (
    <View style={[styles.tile, { width: size, height: size, borderRadius: radius }]}>
      <Text style={{ fontSize: size * 0.5 }}>🏆</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { backgroundColor: '#1c1a16', alignItems: 'center', justifyContent: 'center' },
});
