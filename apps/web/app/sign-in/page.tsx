import { AuthForm } from '@/components/auth-form';
import { AuthShell } from '@/components/auth-shell';
import { githubOAuthEnabled } from '@/lib/oauth';

export default function SignInPage() {
  return (
    <AuthShell title="Sign in" subtitle="Access your workspace and continue building.">
      <AuthForm mode="sign-in" githubEnabled={githubOAuthEnabled()} />
    </AuthShell>
  );
}
