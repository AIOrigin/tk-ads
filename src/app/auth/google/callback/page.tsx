'use client';

import { useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { verifyGoogleCode, getMe } from '@/lib/api/user-api';
import { setToken } from '@/lib/api/client';
import { useAuthStore } from '@/lib/store/auth-store';
import { toast } from '@/components/ui/Toast';
import { trackEvent } from '@/lib/analytics';
import { buildLoginRedirect, consumePostAuthRedirect } from '@/lib/funnel';

function CallbackContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get('code');
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const processed = useRef(false);

  useEffect(() => {
    if (!code || processed.current) return;
    processed.current = true;

    async function handleCallback() {
      try {
        const { access_token, is_first_login } = await verifyGoogleCode(code!);
        setToken(access_token);
        const user = await getMe();
        setAuth(access_token, user);
        trackEvent(is_first_login ? 'sign_up' : 'login', { method: 'google' });
        router.replace(consumePostAuthRedirect('/'));
      } catch {
        toast.error('Google sign-in failed. Please try again.');
        router.replace(buildLoginRedirect(consumePostAuthRedirect('/')));
      }
    }

    handleCallback();
  }, [code, router, setAuth]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center">
      <div className="w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin mb-4" />
      <p className="text-gray-500">Signing you in...</p>
    </div>
  );
}

export default function GoogleCallbackPage() {
  return (
    <Suspense>
      <CallbackContent />
    </Suspense>
  );
}
