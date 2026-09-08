import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function SupportScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>Support</Text>
        <View style={{ width: 60 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.emoji}>🏆</Text>
        <Text style={styles.heading}>Family Cup Support</Text>
        <Text style={styles.body}>
          Family Cup is a private family app created for any family.
        </Text>
        <Text style={styles.body}>
          If you are experiencing technical issues or have questions about how the app works, please contact:
        </Text>
        <View style={styles.contactCard}>
          <Text style={styles.contactLabel}>Email</Text>
          <Text style={styles.contactValue}>karilynaclark@gmail.com</Text>
        </View>
        <Text style={styles.response}>Response time is typically within 24–48 hours.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#f5f0e8' },
  navBar:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(28,26,22,0.08)' },
  backBtn:      { width: 60 },
  backText:     { fontSize: 15, color: '#d45f2e', fontWeight: '500' },
  navTitle:     { fontSize: 15, fontWeight: '600', color: '#1c1a16' },
  scroll:       { padding: 24, paddingBottom: 48, alignItems: 'center' },
  emoji:        { fontSize: 48, textAlign: 'center', marginTop: 24, marginBottom: 16 },
  heading:      { fontSize: 20, fontWeight: '700', color: '#1c1a16', textAlign: 'center', marginBottom: 20 },
  body:         { fontSize: 14, color: 'rgba(28,26,22,0.7)', lineHeight: 22, textAlign: 'center', marginBottom: 16 },
  contactCard:  { backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '100%', alignItems: 'center', marginTop: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  contactLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(28,26,22,0.35)', marginBottom: 6 },
  contactValue: { fontSize: 15, fontWeight: '600', color: '#d45f2e' },
  response:     { fontSize: 12, color: 'rgba(28,26,22,0.4)', textAlign: 'center', marginTop: 20 },
});
