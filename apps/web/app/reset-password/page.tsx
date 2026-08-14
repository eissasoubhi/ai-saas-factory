import { Suspense } from 'react';
import { AuthShell } from '@/components/auth-shell';
import { ResetPasswordForm } from '@/components/reset-password-form';

export default function ResetPasswordPage() {
  return <AuthShell title="Choose a new password" subtitle="Reset links expire and can only be used once."><Suspense fallback={<p>Loading…</p>}><ResetPasswordForm /></Suspense></AuthShell>;
}
