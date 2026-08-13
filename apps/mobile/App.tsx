import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

export default function App() {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>AI SAAS FACTORY</Text>
        <Text style={styles.title}>Mobile shell ready.</Text>
        <Text style={styles.body}>
          V1.5 will add authenticated sessions, organization switching, RevenueCat and push notifications.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#09090b' },
  card: { borderWidth: 1, borderColor: '#27272a', borderRadius: 20, padding: 24 },
  eyebrow: { color: '#a1a1aa', fontSize: 12, letterSpacing: 2 },
  title: { color: '#fafafa', fontSize: 32, fontWeight: '700', marginTop: 12 },
  body: { color: '#a1a1aa', fontSize: 16, lineHeight: 24, marginTop: 14 },
});
