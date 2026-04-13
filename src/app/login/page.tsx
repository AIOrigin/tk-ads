'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, Suspense } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { EmailLoginForm } from '@/components/auth/EmailLoginForm';
import { sanitizeRedirect } from '@/lib/funnel';

function LoginContent() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = sanitizeRedirect(searchParams.get('redirect'));

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace(redirect);
    }
  }, [isLoading, isAuthenticated, router, redirect]);

  if (isLoading || isAuthenticated) return null;

  return (
    <div className="min-h-screen flex flex-col px-6 pt-14 bg-black">
      <button
        type="button"
        onClick={() => router.back()}
        className="mb-10 text-white/50 text-sm self-start flex items-center gap-1 hover:text-white/80 transition-colors"
      >
        <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Back
      </button>

      <div className="text-center mb-10">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center mx-auto mb-5 shadow-lg shadow-purple-500/20">
          <svg aria-hidden="true" className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-white tracking-tight">Sign in to continue</h1>
        <p className="text-[13px] text-white/40 mt-1">Create your AI dance video</p>
      </div>

      <div className="space-y-4">
        <EmailLoginForm redirect={redirect} />
      </div>

      <p className="mt-auto pb-8 text-center text-[11px] text-white/30 leading-relaxed">
        By continuing you agree to our{' '}
        <a href="/terms" className="underline hover:text-white/60">Terms</a> &{' '}
        <a href="/privacy" className="underline hover:text-white/60">Privacy Policy</a>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
