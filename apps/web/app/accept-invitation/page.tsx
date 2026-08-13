import { Suspense } from 'react';
import { AuthShell } from '@/components/auth-shell';
import { AcceptInvitation } from '@/components/accept-invitation';

export default function AcceptInvitationPage() {
  return <AuthShell title="Workspace invitation" subtitle="Invitations are bound to the invited, verified email address."><Suspense fallback={<p>Loading invitation…</p>}><AcceptInvitation /></Suspense></AuthShell>;
}
