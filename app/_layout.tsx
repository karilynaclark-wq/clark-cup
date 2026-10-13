import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFonts } from 'expo-font';
import { Slot, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import * as Notifications from 'expo-notifications';
import * as Updates from 'expo-updates';
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-reanimated';
import { AuthProvider, useAuth } from '@/context/AuthContext';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function registerPushToken(userId: string) {
  // Push notifications don't work in Expo Go on simulator — need a real device or dev build
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return;

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: '38ca123f-ae30-4d6d-b2be-cc7ef30fc404',
    });
    const token = tokenData.data;

    // Save token to profile so server can send push notifications
    const { createClient } = await import('@supabase/supabase-js');
    const { supabase } = await import('@/lib/supabase');
    await supabase
      .from('profiles')
      // The photo contest reminders fire at 5pm where each person is, so
      // the server needs to know their zone.
      .update({ push_token: token, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })
      .eq('auth_user_id', userId);
  } catch (e) {
    console.log('Push token error:', e);
  }
}

// Rejects rather than hanging, so a slow network cannot pin the app on
// the splash screen waiting for an update server to answer.
function withTimeout<T>(work: Promise<T>, ms: number) {
  return Promise.race([
    work,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timed out')), ms)),
  ]);
}

// Left to itself, expo-updates downloads a new bundle on one launch and
// only runs it on the next, so a fix can sit unseen on someone's phone
// until they happen to kill the app. This checks while the splash screen
// is still up and reloads straight into the new bundle, so an update
// lands on the first launch after it ships.
//
// Returns false only while it is still deciding. Anything that goes
// wrong -- offline, server down, slow -- resolves to true and the app
// starts on the bundle it already has, which is never worse than before.
function useLatestBundle() {
  const [ready, setReady] = useState(!Updates.isEnabled);

  useEffect(() => {
    if (!Updates.isEnabled) return;   // Expo Go and dev builds have none
    let cancelled = false;

    (async () => {
      try {
        const check = await withTimeout(Updates.checkForUpdateAsync(), 4000);
        if (check.isAvailable && !cancelled) {
          await withTimeout(Updates.fetchUpdateAsync(), 8000);
          // Does not return: the app restarts into the new bundle.
          if (!cancelled) return await Updates.reloadAsync();
        }
      } catch {
        // Nothing to do but carry on. The background download that
        // expo-updates does anyway will still land it for next time.
      }
      if (!cancelled) setReady(true);
    })();

    return () => { cancelled = true; };
  }, []);

  return ready;
}

function RootLayoutNav() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [checkingOnboard, setCheckingOnboard] = useState(true);

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === '(auth)';
    const inOnboarding = segments[0] === 'onboarding';

    AsyncStorage.getItem('onboarded').then((val) => {
      setCheckingOnboard(false);
      if (!val && !inOnboarding) {
        router.replace('/onboarding');
      } else if (!session && !inAuthGroup && !inOnboarding) {
        router.replace('/(auth)/login');
      } else if (session && inAuthGroup) {
        router.replace('/(tabs)');
      }
    });
  }, [session, loading]);

  useEffect(() => {
    if (!session) return;
    registerPushToken(session.user.id);
  }, [session]);

  return <Slot />;
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });
  const bundleReady = useLatestBundle();

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  // Stay behind the splash until we know we are on the newest bundle, so
  // a reload never happens in front of the person using the app.
  useEffect(() => {
    if (loaded && bundleReady) SplashScreen.hideAsync();
  }, [loaded, bundleReady]);

  if (!loaded || !bundleReady) return null;

  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}
