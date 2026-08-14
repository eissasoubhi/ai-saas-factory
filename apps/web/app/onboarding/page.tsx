import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { OnboardingForm } from '@/components/onboarding-form';
import { auth } from '@/lib/auth';

export default async function OnboardingPage() {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) redirect('/sign-in');

  const organizations = await auth.api.listOrganizations({ headers: requestHeaders });
  if (organizations.length > 0) redirect('/dashboard');

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-20">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">First run</p>
      <h1 className="mt-3 text-4xl font-bold">Create your workspace</h1>
      <p className="mt-4 max-w-xl text-zinc-400">Workspaces isolate members, billing, usage and audit history. You can invite teammates after setup.</p>
      <OnboardingForm suggestedName={session.user.name} />
    </main>
  );
}
