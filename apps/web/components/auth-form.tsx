'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { authClient } from '@/lib/auth-client';

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);

    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');

    try {
      if (mode === 'sign-up') {
        const name = String(form.get('name') ?? '').trim();
        const result = await authClient.signUp.email({ name, email, password, callbackURL: '/onboarding' });
        if (result.error) throw new Error(result.error.message ?? 'Unable to create account.');
        setNotice('Account created. Check your inbox to verify your email before signing in.');
        return;
      }

      const result = await authClient.signIn.email({ email, password, callbackURL: '/dashboard' });
      if (result.error) {
        if (result.error.status === 403) {
          setNotice('Your email must be verified first. We sent you a new verification link.');
          return;
        }
        throw new Error(result.error.message ?? 'Unable to sign in.');
      }
      router.push('/dashboard');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {mode === 'sign-up' ? <Field label="Name" name="name" type="text" autoComplete="name" required /> : null}
      <Field label="Email" name="email" type="email" autoComplete="email" required />
      <Field label="Password" name="password" type="password" autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'} minLength={10} required />

      {error ? <p className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-200">{error}</p> : null}
      {notice ? <p className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-sm text-zinc-200">{notice}</p> : null}

      <button disabled={pending} className="w-full rounded-lg bg-white px-4 py-3 font-semibold text-black disabled:opacity-50">
        {pending ? 'Working…' : mode === 'sign-up' ? 'Create account' : 'Sign in'}
      </button>

      <div className="flex justify-between text-sm text-zinc-400">
        {mode === 'sign-in' ? (
          <>
            <Link href="/sign-up">Create account</Link>
            <Link href="/forgot-password">Forgot password?</Link>
          </>
        ) : (
          <Link href="/sign-in">Already have an account?</Link>
        )}
      </div>
    </form>
  );
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) {
  const { label, ...input } = props;
  return (
    <label className="block text-sm">
      <span className="mb-2 block font-medium text-zinc-300">{label}</span>
      <input {...input} className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 outline-none focus:border-zinc-500" />
    </label>
  );
}
