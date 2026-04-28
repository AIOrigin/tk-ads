'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { sendOTP } from '@/lib/api/user-api';
import { parseApiError } from '@/lib/api/client';
import { toast } from '@/components/ui/Toast';
import { sanitizeRedirect } from '@/lib/funnel';
import { trackEvent } from '@/lib/analytics';

const SIGNIN_EMAIL_SENT_CODE = 'SIGNIN_EMAIL_SENT';

function buildVerifyUrl(email: string, redirect: string): string {
  const params = new URLSearchParams({
    email,
    redirect,
    otpSentAt: String(Date.now()),
  });
  return `/login/verify?${params.toString()}`;
}

export function EmailLoginForm({
  redirect,
  initialEmail = '',
}: {
  redirect: string;
  initialEmail?: string;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setEmail(initialEmail);
  }, [initialEmail]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setIsLoading(true);
    const safeRedirect = sanitizeRedirect(redirect);
    const trimmedEmail = email.trim();
    trackEvent('login_start', { method: 'email' });
    try {
      await sendOTP(trimmedEmail);
      router.push(buildVerifyUrl(trimmedEmail, safeRedirect));
    } catch (err: unknown) {
      const apiError = await parseApiError(err);
      if (apiError.status === 400 && apiError.code === SIGNIN_EMAIL_SENT_CODE) {
        toast.info('Code already sent, check your email');
        router.push(buildVerifyUrl(trimmedEmail, safeRedirect));
      } else {
        toast.error('Failed to send code. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        type="email"
        placeholder="you@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoComplete="email"
        className="w-full h-[48px] px-4 border border-white/15 rounded-xl text-[14px] text-white bg-white/[0.06] placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400 transition-all"
      />
      <Button
        type="submit"
        size="lg"
        className="w-full"
        isLoading={isLoading}
        disabled={!email.trim()}
      >
        Send Code
      </Button>
    </form>
  );
}
