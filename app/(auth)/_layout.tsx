import { Stack } from 'expo-router';
import { COLORS } from '@/constants/Colors';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: COLORS.white,
        headerTitleStyle: { fontWeight: '700' },
        headerBackTitle: '',
      }}
    >
      {/* The login screen is its own full-bleed design; a nav bar showing
          the route name on top of it just reads as a leftover. */}
      <Stack.Screen name="login" options={{ headerShown: false }} />
    </Stack>
  );
}
