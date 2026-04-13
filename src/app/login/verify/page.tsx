'use client';

import { useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { OTPInput } from '@/components/auth/OTPInput';
import { verifyOTP, sendOTP, getMe } from '@/lib/api/user-api';
import { useAuthStore } from '@/lib/store/auth-store';
import { toast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { trackEvent } from '@/lib/analytics';
import { consumePostAuthRedirect, sanitizeRedirect } from '@/lib/funnel';

function VerifyContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || '';
  const redirect = sanitizeRedirect(searchParams.get('redirect'));
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const handleComplete = useCallback(
    async (code: string) => {
      setIsVerifying(true);
      setError(false);
      try {
        const { accessToken, isFirstLogin } = await verifyOTP(email, code);
        // Set token first so getMe can use it
        const { setToken } = await import('@/lib/api/client');
        setToken(accessToken);
        const userInfo = await getMe();
        setAuth(accessToken, userInfo);
        trackEvent(isFirstLogin ? 'sign_up' : 'login', { method: 'email' });
        router.replace(consumePostAuthRedirect(redirect));
      } catch (err: unknown) {
        setError(true);
        const error = err as { response?: { status: number } };
        if (error?.response?.status === 401) {
          toast.error('Code expired, please resend');
        } else {
          toast.error('Invalid code, please try again');
        }
        setIsVerifying(false);
      }
    },
    [email, redirect, router, setAuth]
  );

  async function handleResend() {
    try {
      await sendOTP(email);
      toast.success('New code sent!');
      setResendCooldown(30);
      const timer = setInterval(() => {
        setResendCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch {
      toast.error('Failed to resend code');
    }
  }

  return (
    <div className="min-h-screen flex flex-col px-6 pt-16">
      <button type="button" onClick={() => router.back()} className="mb-8 text-gray-500 self-start">
        &larr; Back
      </button>

      <div className="text-center mb-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Enter the code</h1>
        <p className="text-gray-500">
          sent to <span className="font-medium text-gray-700">{email}</span>
        </p>
      </div>

      <div className="space-y-6">
        <OTPInput onComplete={handleComplete} error={error} />

        {isVerifying && (
          <div className="flex justify-center">
            <div className="w-6 h-6 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        <div className="text-center">
          <p className="text-sm text-gray-400 mb-2">Didn&apos;t get the code?</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleResend}
            disabled={resendCooldown > 0}
          >
            {resendCooldown > 0 ? `Resend (${resendCooldown}s)` : 'Resend Code'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyContent />
    </Suspense>
  );
}
