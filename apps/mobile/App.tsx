import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { authClient } from './lib/auth-client';
import { mobileApiBaseUrl } from './lib/config';

function ActionButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable style={[styles.button, disabled && styles.buttonDisabled]} onPress={onPress} disabled={disabled}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

export default function App() {
  const { data: session, isPending } = authClient.useSession();
  const { data: organizations } = authClient.useListOrganizations();
  const { data: activeOrganization } = authClient.useActiveOrganization();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setError(null);
    const result = await authClient.signIn.email({ email: email.trim(), password });
    setBusy(false);
    if (result.error) setError(result.error.message ?? 'Sign in failed');
  }

  async function signOut() {
    setBusy(true);
    setError(null);
    const result = await authClient.signOut();
    setBusy(false);
    if (result.error) setError(result.error.message ?? 'Sign out failed');
  }

  async function switchOrganization(organizationId: string) {
    setBusy(true);
    setError(null);
    const result = await authClient.organization.setActive({ organizationId });
    setBusy(false);
    if (result.error) setError(result.error.message ?? 'Workspace switch failed');
  }

  if (isPending) {
    return (
      <SafeAreaView style={styles.screen}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>AI SAAS FACTORY</Text>
          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.body}>Your session and cookies are stored through Expo SecureStore.</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="Email"
            placeholderTextColor="#71717a"
            style={styles.input}
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            autoCapitalize="none"
            autoComplete="password"
            placeholder="Password"
            placeholderTextColor="#71717a"
            secureTextEntry
            style={styles.input}
            value={password}
            onChangeText={setPassword}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <ActionButton label={busy ? 'Signing in…' : 'Sign in'} onPress={() => void signIn()} disabled={busy || !email || !password} />
          <Text style={styles.meta}>API: {mobileApiBaseUrl()}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>AI SAAS FACTORY</Text>
          <Text style={styles.title}>Welcome, {session.user.name}</Text>
          <Text style={styles.body}>{session.user.email}</Text>
          <Text style={styles.sectionTitle}>Active workspace</Text>
          <Text style={styles.body}>{activeOrganization?.name ?? 'None selected'}</Text>
          <View style={styles.workspaceList}>
            {(organizations ?? []).map((organization) => (
              <Pressable
                key={organization.id}
                style={[
                  styles.workspace,
                  activeOrganization?.id === organization.id && styles.workspaceActive,
                ]}
                onPress={() => void switchOrganization(organization.id)}
                disabled={busy}
              >
                <Text style={styles.workspaceName}>{organization.name}</Text>
                <Text style={styles.meta}>{organization.slug}</Text>
              </Pressable>
            ))}
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <ActionButton label={busy ? 'Working…' : 'Sign out'} onPress={() => void signOut()} disabled={busy} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', backgroundColor: '#09090b' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  card: { borderWidth: 1, borderColor: '#27272a', borderRadius: 20, padding: 24, gap: 12 },
  eyebrow: { color: '#a1a1aa', fontSize: 12, letterSpacing: 2 },
  title: { color: '#fafafa', fontSize: 30, fontWeight: '700', marginTop: 4 },
  sectionTitle: { color: '#fafafa', fontSize: 16, fontWeight: '600', marginTop: 8 },
  body: { color: '#a1a1aa', fontSize: 15, lineHeight: 22 },
  input: { borderWidth: 1, borderColor: '#3f3f46', borderRadius: 12, color: '#fafafa', paddingHorizontal: 14, paddingVertical: 12 },
  button: { borderRadius: 12, backgroundColor: '#fafafa', paddingVertical: 13, alignItems: 'center' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#09090b', fontWeight: '700' },
  error: { color: '#fca5a5', fontSize: 14 },
  meta: { color: '#71717a', fontSize: 12 },
  workspaceList: { gap: 8 },
  workspace: { borderWidth: 1, borderColor: '#27272a', borderRadius: 12, padding: 12 },
  workspaceActive: { borderColor: '#a1a1aa' },
  workspaceName: { color: '#fafafa', fontWeight: '600' },
});
