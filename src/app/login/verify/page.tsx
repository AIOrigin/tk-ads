'use client';

import { useState, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { OTPInput, type OTPInputHandle } from '@/components/auth/OTPInput';
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
  const otpRef = useRef<OTPInputHandle>(null);

  const handleComplete = useCallback(
    async (code: string) => {
      setIsVerifying(true);
      setError(false);
      try {
        let accessToken: string;
        let isFirstLogin: boolean;
        try {
          const result = await verifyOTP(email, code);
          accessToken = result.accessToken;
          isFirstLogin = result.isFirstLogin;
        } catch (err: unknown) {
          // Verification code error
          setError(true);
          const verifyErr = err as { response?: { status: number } };
          if (verifyErr?.response?.status === 401) {
            toast.error('Code expired, please resend');
          } else {
            toast.error('Invalid code, please try again');
          }
          setIsVerifying(false);
          setTimeout(() => {
            setError(false);
            otpRef.current?.reset();
          }, 600);
          return;
        }

        // Code verified successfully — now set up auth
        const { setToken } = await import('@/lib/api/client');
        setToken(accessToken);
        const userInfo = await getMe();
        setAuth(accessToken, userInfo);
        trackEvent(isFirstLogin ? 'sign_up' : 'login', { method: 'email' });
        router.replace(consumePostAuthRedirect(redirect));
      } catch {
        // getMe or other post-auth error — code was correct, just log in with what we have
        toast.error('Sign-in succeeded but failed to load profile. Please refresh.');
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
    <div className="min-h-screen flex flex-col px-6 pt-16 bg-black">
      <button type="button" onClick={() => router.back()} className="mb-8 text-white/50 self-start hover:text-white/80 transition-colors">
        &larr; Back
      </button>

      <div className="text-center mb-10">
        <h1 className="text-2xl font-bold text-white mb-2">Enter the code</h1>
        <p className="text-white/50">
          sent to <span className="font-medium text-white">{email}</span>
        </p>
      </div>

      <div className="space-y-6">
        <OTPInput ref={otpRef} onComplete={handleComplete} error={error} />

        {isVerifying && (
          <div className="flex justify-center">
            <div className="w-6 h-6 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        <div className="text-center">
          <p className="text-sm text-white/40 mb-2">Didn&apos;t get the code?</p>
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
