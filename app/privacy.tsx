import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function PrivacyPolicyScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>Privacy Policy</Text>
        <View style={{ width: 60 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.updated}>Last Updated: September 2026</Text>

        <Text style={styles.intro}>
          Family Cup lets a family track a friendly points competition together. Everything you add is shared with the members of your family group and with no one else.
        </Text>

        <Text style={styles.heading}>Information We Collect</Text>
        <Text style={styles.body}>We collect only what the app needs in order to work.</Text>

        <Text style={styles.subheading}>Information You Provide</Text>
        <Text style={styles.body}>
          • Your email address and password, used to sign in{'\n'}
          • Your display name{'\n'}
          • Your mailing address and phone number, if you choose to add them — both are optional, and both are visible to your family group{'\n'}
          • Photos you upload, including a profile picture and any photo you attach to a point submission{'\n'}
          • The points you log and any description or notes you write with them
        </Text>

        <Text style={styles.subheading}>Automatically Collected Information</Text>
        <Text style={styles.body}>
          • Device information (such as device type and operating system version){'\n'}
          • A push notification token, if you allow notifications, used only to deliver them{'\n\n'}
          We do not collect your contacts, your precise location, financial information, or health data. We do not use analytics or advertising trackers.
        </Text>

        <Text style={styles.heading}>How We Use Information</Text>
        <Text style={styles.body}>
          We use what we collect only to:{'\n\n'}
          • Show your points, photos and events to your family group{'\n'}
          • Send the notifications you have enabled{'\n'}
          • Keep the app working and reliable{'\n\n'}
          We never use your information for advertising or marketing, and we never sell it.
        </Text>

        <Text style={styles.heading}>Who Can See Your Information</Text>
        <Text style={styles.body}>
          Your data is visible only to members of your family group — people who joined using your family's invite code. Other families using the app cannot see your family's members, points, photos or events.{'\n\n'}
          Anyone who has your invite code can join your family group and see what it contains, so share the code only with people you want to include.
        </Text>

        <Text style={styles.heading}>Where Your Information Is Stored</Text>
        <Text style={styles.body}>
          Data is stored with Supabase, which hosts our database and file storage. Push notifications are delivered through Expo and Apple. These providers process data only to operate the app on our behalf.
        </Text>

        <Text style={styles.heading}>Deleting Your Account</Text>
        <Text style={styles.body}>
          You can delete your account at any time from the Profile screen, under Sign Out. Deleting is permanent and immediate: it removes your profile, your photos, and every point you have logged, and those points disappear from your family's leaderboard. It cannot be undone.{'\n\n'}
          If you would rather delete your data by request, email the address below.
        </Text>

        <Text style={styles.heading}>Data Retention</Text>
        <Text style={styles.body}>
          We keep your information for as long as your account exists. When you delete your account, your personal data is removed from our database at that time.
        </Text>

        <Text style={styles.heading}>Children's Privacy</Text>
        <Text style={styles.body}>
          Family Cup is meant to be used within a family, and children may take part through an account created and managed by a parent or guardian. We do not knowingly collect personal information directly from children without a parent setting up and overseeing the account.
        </Text>

        <Text style={styles.heading}>Changes to This Policy</Text>
        <Text style={styles.body}>
          This Privacy Policy may be updated periodically. Updates will appear on this page with a revised "Last Updated" date.
        </Text>

        <Text style={styles.heading}>Contact</Text>
        <Text style={styles.body}>
          Questions about this policy, or requests about your data:{'\n\n'}
          karilynaclark@gmail.com
        </Text>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f0e8' },
  navBar:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(28,26,22,0.08)' },
  backBtn:   { width: 60 },
  backText:  { fontSize: 15, color: '#d45f2e', fontWeight: '500' },
  navTitle:  { fontSize: 15, fontWeight: '600', color: '#1c1a16' },
  scroll:    { padding: 24, paddingBottom: 48 },
  updated:   { fontSize: 12, color: 'rgba(28,26,22,0.4)', marginBottom: 16 },
  intro:     { fontSize: 14, color: '#1c1a16', lineHeight: 22, marginBottom: 24 },
  heading:   { fontSize: 15, fontWeight: '700', color: '#1c1a16', marginTop: 24, marginBottom: 8 },
  subheading:{ fontSize: 13, fontWeight: '600', color: '#1c1a16', marginTop: 12, marginBottom: 6 },
  body:      { fontSize: 13, color: 'rgba(28,26,22,0.7)', lineHeight: 21 },
});
