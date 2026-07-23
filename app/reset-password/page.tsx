'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://zcugxtcbvkrquxeuonop.supabase.co').replace(/\/$/, '');
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_cK1tQvEVsg69SIMrrdLQpQ_Sw2ot5qb';

const readRecoveryParams = () => {
  if (typeof window === 'undefined') return new URLSearchParams();
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const searchParams = new URLSearchParams(window.location.search);
  searchParams.forEach((value, key) => {
    if (!params.has(key)) params.set(key, value);
  });
  return params;
};

export default function ResetPasswordPage() {
  const [accessToken, setAccessToken] = useState('');
  const [linkStatus, setLinkStatus] = useState<'checking' | 'ready' | 'invalid'>('checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const passwordMismatch = useMemo(() => Boolean(confirmPassword && password !== confirmPassword), [confirmPassword, password]);

  useEffect(() => {
    const params = readRecoveryParams();
    const token = params.get('access_token') || '';
    const type = params.get('type') || '';
    if (!token || (type && type !== 'recovery')) {
      setLinkStatus('invalid');
      setStatus('This Hue Studio reset link is missing, expired, or has already been used.');
      return;
    }
    setAccessToken(token);
    setLinkStatus('ready');
    setStatus('Choose a new password for your Hue Studio account.');
    window.history.replaceState(null, '', '/reset-password');
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken) {
      setStatus('This reset link is not valid anymore. Please request a new Hue Studio password reset email.');
      return;
    }
    if (password.length < 6) {
      setStatus('Please use at least 6 characters for your new password.');
      return;
    }
    if (password !== confirmPassword) {
      setStatus('Those passwords do not match yet.');
      return;
    }
    setIsSaving(true);
    setStatus('Updating your Hue Studio password...');
    try {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: 'PUT',
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ password })
      });
      const data = await response.json().catch(() => ({})) as { msg?: string; message?: string; error_description?: string };
      if (!response.ok) throw new Error(data.error_description || data.message || data.msg || 'Hue Studio could not update your password. Please request a fresh reset link.');
      setPassword('');
      setConfirmPassword('');
      setStatus('Password updated. You can sign in to Hue Studio now.');
      setLinkStatus('invalid');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Hue Studio could not update your password. Please request a fresh reset link.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#02070d] bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.22),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(12,74,110,0.24),transparent_42%)] px-4 py-8 text-slate-100">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-2xl items-center justify-center">
        <div className="w-full overflow-hidden rounded-3xl border border-[#0ea5e9]/35 bg-[#07111f]/95 shadow-[0_38px_120px_rgba(0,0,0,0.72),0_0_50px_rgba(14,165,233,0.16)] backdrop-blur">
          <div className="border-b border-white/10 bg-[linear-gradient(135deg,rgba(8,21,34,0.96),rgba(5,38,62,0.92))] px-7 py-7">
            <img src="/brand/hue-studio-logo.webp" alt="Hue Studio" width={1200} height={342} className="h-auto w-64 rounded border border-white/10 bg-transparent object-contain" />
            <p className="mt-6 text-xs font-black uppercase tracking-[0.32em] text-[#67d8ff]">Hue Customer Account</p>
            <h1 className="mt-2 text-3xl font-black text-white">Reset your password</h1>
            <p className="mt-3 text-sm leading-6 text-slate-300">Create a fresh password, then head back to Hue Studio to sign in and keep ordering.</p>
          </div>

          <div className="space-y-5 px-7 py-7">
            <div className="rounded-2xl border border-[#0ea5e9]/25 bg-[#062235]/70 px-4 py-3 text-sm leading-6 text-slate-200">
              {status || 'Checking your Hue Studio reset link...'}
            </div>

            {linkStatus === 'ready' ? <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block text-sm font-bold text-slate-200">New password
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full rounded-xl border border-white/15 bg-[#02070d] px-4 py-3 text-white outline-none ring-[#0ea5e9]/40 focus:ring-2" autoComplete="new-password" />
              </label>
              <label className="block text-sm font-bold text-slate-200">Confirm new password
                <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-1 w-full rounded-xl border border-white/15 bg-[#02070d] px-4 py-3 text-white outline-none ring-[#0ea5e9]/40 focus:ring-2" autoComplete="new-password" />
              </label>
              {passwordMismatch ? <p className="rounded-xl border border-amber-300/35 bg-amber-300/10 px-3 py-2 text-sm font-bold text-amber-100">Those passwords do not match yet.</p> : null}
              <button type="submit" disabled={isSaving} className="w-full rounded-xl border border-[#0ea5e9]/60 bg-[#1678b8] px-5 py-3 text-sm font-black uppercase tracking-[0.12em] text-white shadow-[0_0_22px_rgba(14,165,233,0.20)] hover:bg-[#0f5f94] disabled:cursor-wait disabled:opacity-60">{isSaving ? 'Updating...' : 'Update Password'}</button>
            </form> : null}

            <a href="/" className="block rounded-xl border border-white/15 bg-[#0b1018] px-5 py-3 text-center text-sm font-black uppercase tracking-[0.12em] text-slate-100 hover:border-[#0ea5e9]/70">Back to Hue Studio</a>
          </div>
        </div>
      </section>
    </main>
  );
}
