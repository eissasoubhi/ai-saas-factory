import { AuthForm } from '@/components/auth-form';
import { AuthShell } from '@/components/auth-shell';

export default function SignInPage() {
  return <AuthShell title="Sign in" subtitle="Access your workspace and continue building."><AuthForm mode="sign-in" /></AuthShell>;
}
