import type { MobileFilesResponse, MobileOverviewResponse } from '@factory/contracts';
import { useEffect, useState } from 'react';
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
import { getMobileFiles, getMobileOverview } from './lib/product-api';

type ProductTab = 'dashboard' | 'usage' | 'files';

function ActionButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable style={[styles.button, disabled && styles.buttonDisabled]} onPress={onPress} disabled={disabled}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatUsdMicros(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value / 1_000_000);
}

function formatBytes(value: number) {
  if (value < 1_024) return `${value} B`;
  if (value < 1_048_576) return `${(value / 1_024).toFixed(1)} KB`;
  return `${(value / 1_048_576).toFixed(1)} MB`;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.meta}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

export default function App() {
  const { data: session, isPending } = authClient.useSession();
  const { data: organizations } = authClient.useListOrganizations();
  const { data: activeOrganization } = authClient.useActiveOrganization();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingProduct, setLoadingProduct] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ProductTab>('dashboard');
  const [overview, setOverview] = useState<MobileOverviewResponse | null>(null);
  const [files, setFiles] = useState<MobileFilesResponse['items']>([]);

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
    setOverview(null);
    setFiles([]);
    const result = await authClient.organization.setActive({ organizationId });
    setBusy(false);
    if (result.error) setError(result.error.message ?? 'Workspace switch failed');
  }

  async function refreshProductData() {
    if (!session || !activeOrganization?.id) return;
    setLoadingProduct(true);
    setError(null);
    try {
      const [nextOverview, nextFiles] = await Promise.all([
        getMobileOverview(),
        getMobileFiles(),
      ]);
      setOverview(nextOverview);
      setFiles(nextFiles.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load workspace data');
    } finally {
      setLoadingProduct(false);
    }
  }

  useEffect(() => {
    if (!session || !activeOrganization?.id) {
      setOverview(null);
      setFiles([]);
      return;
    }
    void refreshProductData();
  }, [session?.user.id, activeOrganization?.id]);

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
        <View style={styles.authCard}>
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

  const readyFiles = files.filter((file) => file.status === 'ready').length;

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerCard}>
          <Text style={styles.eyebrow}>AI SAAS FACTORY</Text>
          <Text style={styles.title}>Hi, {session.user.name}</Text>
          <Text style={styles.body}>{activeOrganization?.name ?? 'Select a workspace'}</Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.workspaceList}>
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
          </ScrollView>

          <View style={styles.tabBar}>
            {(['dashboard', 'usage', 'files'] as const).map((item) => (
              <Pressable key={item} style={[styles.tab, tab === item && styles.tabActive]} onPress={() => setTab(item)}>
                <Text style={[styles.tabText, tab === item && styles.tabTextActive]}>{item[0]?.toUpperCase()}{item.slice(1)}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

        {loadingProduct && !overview ? (
          <View style={styles.loadingCard}><ActivityIndicator /></View>
        ) : null}

        {tab === 'dashboard' && overview ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Workspace overview</Text>
            <View style={styles.metricGrid}>
              <Metric label="Plan" value={overview.usage.plan.toUpperCase()} />
              <Metric label="Role" value={overview.organization.role} />
              <Metric label="AI requests" value={`${formatNumber(overview.usage.requests)} / ${formatNumber(overview.usage.requestLimit)}`} />
              <Metric label="Ready files" value={`${readyFiles} / ${files.length}`} />
            </View>
            <Text style={styles.body}>Usage since {new Date(overview.usage.monthStart).toLocaleDateString()}.</Text>
          </View>
        ) : null}

        {tab === 'usage' && overview ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>AI usage</Text>
            <View style={styles.metricGrid}>
              <Metric label="Credit balance" value={formatUsdMicros(overview.usage.creditBalanceMicros)} />
              <Metric label="Included credits" value={formatUsdMicros(overview.usage.includedCreditMicros)} />
              <Metric label="Estimated model cost" value={formatUsdMicros(overview.usage.estimatedCostMicros)} />
              <Metric label="Overage" value={overview.usage.overageAllowed ? 'Allowed' : 'Blocked'} />
              <Metric label="Input tokens" value={formatNumber(overview.usage.inputTokens)} />
              <Metric label="Output tokens" value={formatNumber(overview.usage.outputTokens)} />
              <Metric label="Embedding tokens" value={formatNumber(overview.usage.embeddingTokens)} />
              <Metric label="Requests" value={formatNumber(overview.usage.requests)} />
            </View>
          </View>
        ) : null}

        {tab === 'files' ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Files</Text>
            {files.length === 0 ? <Text style={styles.body}>No workspace files yet.</Text> : null}
            <View style={styles.fileList}>
              {files.map((file) => (
                <View style={styles.fileRow} key={file.id}>
                  <View style={styles.fileCopy}>
                    <Text style={styles.workspaceName} numberOfLines={1}>{file.originalName}</Text>
                    <Text style={styles.meta}>{file.contentType} · {formatBytes(file.sizeBytes)}</Text>
                  </View>
                  <Text style={styles.status}>{file.status}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.footerActions}>
          <ActionButton label={loadingProduct ? 'Refreshing…' : 'Refresh'} onPress={() => void refreshProductData()} disabled={loadingProduct || busy || !activeOrganization} />
          <Pressable onPress={() => void signOut()} disabled={busy}>
            <Text style={styles.signOut}>{busy ? 'Working…' : 'Sign out'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#09090b' },
  scroll: { flexGrow: 1, padding: 20, gap: 16 },
  authCard: { marginTop: 'auto', marginBottom: 'auto', borderWidth: 1, borderColor: '#27272a', borderRadius: 20, padding: 24, gap: 12 },
  headerCard: { borderWidth: 1, borderColor: '#27272a', borderRadius: 20, padding: 20, gap: 10 },
  section: { borderWidth: 1, borderColor: '#27272a', borderRadius: 20, padding: 18, gap: 14 },
  loadingCard: { borderWidth: 1, borderColor: '#27272a', borderRadius: 20, padding: 28 },
  eyebrow: { color: '#a1a1aa', fontSize: 12, letterSpacing: 2 },
  title: { color: '#fafafa', fontSize: 30, fontWeight: '700', marginTop: 4 },
  sectionTitle: { color: '#fafafa', fontSize: 18, fontWeight: '700' },
  body: { color: '#a1a1aa', fontSize: 15, lineHeight: 22 },
  input: { borderWidth: 1, borderColor: '#3f3f46', borderRadius: 12, color: '#fafafa', paddingHorizontal: 14, paddingVertical: 12 },
  button: { borderRadius: 12, backgroundColor: '#fafafa', paddingVertical: 13, paddingHorizontal: 18, alignItems: 'center' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#09090b', fontWeight: '700' },
  error: { color: '#fca5a5', fontSize: 14 },
  errorBanner: { color: '#fecaca', borderWidth: 1, borderColor: '#7f1d1d', backgroundColor: '#450a0a', borderRadius: 12, padding: 12 },
  meta: { color: '#71717a', fontSize: 12 },
  workspaceList: { gap: 8, paddingVertical: 4 },
  workspace: { minWidth: 140, borderWidth: 1, borderColor: '#27272a', borderRadius: 12, padding: 12 },
  workspaceActive: { borderColor: '#a1a1aa' },
  workspaceName: { color: '#fafafa', fontWeight: '600' },
  tabBar: { flexDirection: 'row', gap: 8, marginTop: 6 },
  tab: { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: '#27272a', paddingVertical: 10, alignItems: 'center' },
  tabActive: { backgroundColor: '#fafafa' },
  tabText: { color: '#a1a1aa', fontSize: 12, fontWeight: '600' },
  tabTextActive: { color: '#09090b' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: { width: '48%', minHeight: 82, borderWidth: 1, borderColor: '#27272a', borderRadius: 14, padding: 12, gap: 6 },
  metricValue: { color: '#fafafa', fontSize: 17, fontWeight: '700' },
  fileList: { gap: 8 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#27272a', borderRadius: 12, padding: 12 },
  fileCopy: { flex: 1, gap: 3 },
  status: { color: '#a1a1aa', fontSize: 12, textTransform: 'uppercase' },
  footerActions: { gap: 14, paddingBottom: 20 },
  signOut: { color: '#a1a1aa', textAlign: 'center', paddingVertical: 8 },
});
