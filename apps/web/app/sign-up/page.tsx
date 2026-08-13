import { AuthForm } from '@/components/auth-form';
import { AuthShell } from '@/components/auth-shell';

export default function SignUpPage() {
  return <AuthShell title="Create your account" subtitle="Start with a verified account, then create your first workspace."><AuthForm mode="sign-up" /></AuthShell>;
}
