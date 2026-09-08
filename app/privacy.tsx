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
        <Text style={styles.updated}>Last Updated: December 2025</Text>

        <Text style={styles.intro}>
          Family Cup is a platform for families created to help members of a household share updates, track points, and participate in family activities.
        </Text>

        <Text style={styles.heading}>Information We Collect</Text>
        <Text style={styles.body}>We collect only the information necessary for the app to function.</Text>

        <Text style={styles.subheading}>Information You Provide</Text>
        <Text style={styles.body}>
          Information you voluntarily submit through the app, such as actions taken within the app (e.g., adding points or updates) that are visible to other family members.
        </Text>

        <Text style={styles.subheading}>Automatically Collected Information</Text>
        <Text style={styles.body}>
          • Device information (such as device type and operating system version){'\n'}
          • Push notification tokens (used solely to deliver app-related notifications){'\n'}
          • Basic usage data required for app functionality and performance{'\n\n'}
          We do not collect sensitive personal data such as contacts, photos, precise location, financial information, or health data.
        </Text>

        <Text style={styles.heading}>How We Use Information</Text>
        <Text style={styles.body}>
          We use collected information only to:{'\n\n'}
          • Send push notifications triggered by actions within the app{'\n'}
          • Display shared updates to family members{'\n'}
          • Maintain and improve the reliability and functionality of the app{'\n\n'}
          Information is not used for advertising or marketing purposes.
        </Text>

        <Text style={styles.heading}>Push Notifications</Text>
        <Text style={styles.body}>
          If you enable notifications, the app may send you notifications related to app activity (such as updates or reminders). You may disable notifications at any time through your device settings.
        </Text>

        <Text style={styles.heading}>Data Sharing</Text>
        <Text style={styles.body}>
          This app is private and intended only for invited family members.{'\n\n'}
          We do not sell, rent, or share personal information with third parties. Limited data may be processed by service providers necessary to operate the app (such as Apple for push notification delivery or backend hosting providers).
        </Text>

        <Text style={styles.heading}>Data Security</Text>
        <Text style={styles.body}>
          We take reasonable measures to protect information used within the app. Access is limited to invited family members.
        </Text>

        <Text style={styles.heading}>Children's Privacy</Text>
        <Text style={styles.body}>
          This app is intended for use within a private family context. It does not knowingly collect personal information from children outside of this private context.
        </Text>

        <Text style={styles.heading}>Changes to This Policy</Text>
        <Text style={styles.body}>
          This Privacy Policy may be updated periodically. Updates will be reflected on this page with a revised "Last Updated" date.
        </Text>

        <Text style={styles.heading}>Contact</Text>
        <Text style={styles.body}>
          If you have questions about this Privacy Policy, please contact:{'\n\n'}
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
