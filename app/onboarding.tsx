import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: W } = Dimensions.get('window');

const C = {
  bg:     '#f5f0e8',
  card:   '#ffffff',
  ink:    '#1c1a16',
  inkMid: 'rgba(28,26,22,0.5)',
  inkDim: 'rgba(28,26,22,0.25)',
  accent: '#d45f2e',
  green:  '#3a6b4a',
};

const SLIDES = [
  {
    emoji: '🏆',
    title: 'Family Cup',
    subtitle: 'Unite your family around the world into one epic competition.',
    bg: C.ink,
    textColor: '#fff',
    subColor: 'rgba(255,255,255,0.6)',
    dotActive: '#fff',
    dotInactive: 'rgba(255,255,255,0.25)',
  },
  {
    emoji: '⭐',
    title: 'Earn Points Together',
    subtitle: 'Score points for weekly activities — Sunday calls, photo contests, board games, recipes, and more.',
    bg: C.bg,
    textColor: C.ink,
    subColor: C.inkMid,
    dotActive: C.ink,
    dotInactive: C.inkDim,
  },
  {
    emoji: '📊',
    title: 'Track the Standings',
    subtitle: 'Watch the leaderboard shift week by week. Every point counts — glory goes to the victor.',
    bg: C.bg,
    textColor: C.ink,
    subColor: C.inkMid,
    dotActive: C.ink,
    dotInactive: C.inkDim,
  },
  {
    emoji: '📸',
    title: 'Share Moments',
    subtitle: 'Upload photos, vote on winners, and keep the whole family connected no matter the distance.',
    bg: C.green,
    textColor: '#fff',
    subColor: 'rgba(255,255,255,0.65)',
    dotActive: '#fff',
    dotInactive: 'rgba(255,255,255,0.25)',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);

  const handleScroll = (e: any) => {
    const newPage = Math.round(e.nativeEvent.contentOffset.x / W);
    setPage(newPage);
  };

  const next = () => {
    if (page < SLIDES.length - 1) {
      scrollRef.current?.scrollTo({ x: (page + 1) * W, animated: true });
    } else {
      finish();
    }
  };

  const finish = async () => {
    await AsyncStorage.setItem('onboarded', 'true');
    router.replace('/(auth)/login');
  };

  const slide = SLIDES[page];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: slide.bg }]} edges={['top', 'bottom']}>
      <StatusBar style={slide.bg === C.ink || slide.bg === C.green ? 'light' : 'dark'} />

      {/* Skip */}
      <TouchableOpacity style={styles.skipBtn} onPress={finish} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={[styles.skipText, { color: slide.subColor }]}>Skip</Text>
      </TouchableOpacity>

      {/* Slides */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
      >
        {SLIDES.map((s, i) => (
          <View key={i} style={[styles.slide, { backgroundColor: s.bg }]}>
            <Text style={styles.slideEmoji}>{s.emoji}</Text>
            <Text style={[styles.slideTitle, { color: s.textColor }]}>{s.title}</Text>
            <Text style={[styles.slideSubtitle, { color: s.subColor }]}>{s.subtitle}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Dots */}
      <View style={styles.dotsRow}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              { backgroundColor: i === page ? slide.dotActive : slide.dotInactive,
                width: i === page ? 20 : 6 }
            ]}
          />
        ))}
      </View>

      {/* CTA */}
      <View style={styles.btnWrap}>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: page === SLIDES.length - 1 ? C.accent : slide.textColor === '#fff' ? '#fff' : C.ink }]}
          onPress={next}
          activeOpacity={0.85}
        >
          <Text style={[styles.btnText, { color: page === SLIDES.length - 1 ? '#fff' : slide.bg }]}>
            {page === SLIDES.length - 1 ? 'Get Started' : 'Next'}
          </Text>
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  skipBtn:   { alignSelf: 'flex-end', paddingHorizontal: 24, paddingTop: 8, paddingBottom: 4 },
  skipText:  { fontSize: 14, fontWeight: '500' },

  slide: {
    width: W,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  slideEmoji:    { fontSize: 72, marginBottom: 32 },
  slideTitle:    { fontSize: 34, fontWeight: '700', letterSpacing: -1, textAlign: 'center', marginBottom: 16 },
  slideSubtitle: { fontSize: 17, lineHeight: 26, textAlign: 'center', fontWeight: '400' },

  dotsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingBottom: 20 },
  dot:     { height: 6, borderRadius: 3 },

  btnWrap: { paddingHorizontal: 24, paddingBottom: 16 },
  btn:     { borderRadius: 22, paddingVertical: 18, alignItems: 'center' },
  btnText: { fontSize: 16, fontWeight: '700', letterSpacing: 0.1 },
});
