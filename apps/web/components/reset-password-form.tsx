'use client';

import { FormEvent, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

export function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      setError('This reset link is invalid or incomplete.');
      return;
    }
    setPending(true);
    setError(null);
    const password = String(new FormData(event.currentTarget).get('password') ?? '');
    const result = await authClient.resetPassword({ newPassword: password, token });
    if (result.error) {
      setError(result.error.message ?? 'Unable to reset password.');
      setPending(false);
      return;
    }
    router.push('/sign-in');
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <label className="block text-sm">
        <span className="mb-2 block font-medium text-zinc-300">New password</span>
        <input name="password" type="password" minLength={10} maxLength={128} autoComplete="new-password" required className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 outline-none focus:border-zinc-500" />
      </label>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      <button disabled={pending} className="w-full rounded-lg bg-white px-4 py-3 font-semibold text-black disabled:opacity-50">{pending ? 'Saving…' : 'Set new password'}</button>
    </form>
  );
}
