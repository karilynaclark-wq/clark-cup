import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export type Profile = {
  id: string;
  auth_user_id: string | null;
  username: string;
  email: string | null;
  avatar_url: string | null;
  address: string | null;
  phone: string | null;
  total_points: number;
  created_at: string;
};

export type PointSubmission = {
  id: string;
  user_id: string;
  category: 'sunday_call' | 'weekly_photo' | 'miscellaneous';
  custom_name: string | null;
  points: number;
  photo_url: string | null;
  notes: string | null;
  submitted_at: string;
  profiles?: Pick<Profile, 'username' | 'avatar_url'>;
};
