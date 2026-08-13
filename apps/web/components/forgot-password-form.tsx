'use client';

import { FormEvent, useState } from 'react';
import { authClient } from '@/lib/auth-client';

export function ForgotPasswordForm() {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const email = String(new FormData(event.currentTarget).get('email') ?? '').trim();
    await authClient.requestPasswordReset({ email, redirectTo: '/reset-password' });
    setSent(true);
    setPending(false);
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <label className="block text-sm">
        <span className="mb-2 block font-medium text-zinc-300">Email</span>
        <input name="email" type="email" autoComplete="email" required className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 outline-none focus:border-zinc-500" />
      </label>
      {sent ? <p className="text-sm text-zinc-300">If an account exists for that email, a reset link has been sent.</p> : null}
      <button disabled={pending} className="w-full rounded-lg bg-white px-4 py-3 font-semibold text-black disabled:opacity-50">{pending ? 'Sending…' : 'Send reset link'}</button>
    </form>
  );
}
