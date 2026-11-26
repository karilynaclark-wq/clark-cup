import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { COLORS } from '@/constants/Colors';

const TABS = [
  { name: 'index',     label: 'Home',      emoji: '🏠' },
  { name: 'my-points', label: 'The Cup',   emoji: '🏆' },
  // The calendar and the family record share a tab: both are the
  // family writing down what happened. The file keeps its name so
  // every existing link to /memories still resolves.
  { name: 'memories',  label: 'Knowledge', emoji: '📅' },
];

function EmojiTabIcon({ emoji, label, focused }: { emoji: string; label: string; focused: boolean }) {
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
      <Text style={styles.emoji}>{emoji}</Text>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textSecondary,
        tabBarStyle: {
          backgroundColor: '#F5F5F0',
          borderTopColor: COLORS.border,
          height: 72,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 0,
        },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.label,
            tabBarIcon: ({ focused }) => (
              <EmojiTabIcon emoji={tab.emoji} label={tab.label} focused={focused} />
            ),
          }}
        />
      ))}
      {/* Reached from the Photo Contest card on Home. Inside the tab group
          so the tab bar stays visible, but href null keeps it off the bar. */}
      <Tabs.Screen name="photo-contest" options={{ href: null }} />
      {/* The standings and the points list are one screen now. These
          routes stay for the per-person pages the bars link to, and for
          Family Cup History, but the bar no longer carries them. */}
      <Tabs.Screen name="leaderboard" options={{ href: null }} />
      {/* Reached from the avatar in each page's header rather than the tab
          bar, which keeps the bar to the three places you actually move
          between. Account deletion lives here, so it stays one tap away. */}
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 48,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: '#E8EDE8',
  },
  emoji: {
    fontSize: 22,
  },
});
