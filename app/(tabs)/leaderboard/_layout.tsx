import { Stack } from 'expo-router';
import { COLORS } from '@/constants/Colors';

export default function LeaderboardLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: COLORS.white,
        headerTitleStyle: { fontWeight: '700' },
      }}
    />
  );
}
