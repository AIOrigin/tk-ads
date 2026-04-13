'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { sendOTP } from '@/lib/api/user-api';
import { toast } from '@/components/ui/Toast';
import { sanitizeRedirect } from '@/lib/funnel';

export function EmailLoginForm({ redirect }: { redirect: string }) {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setIsLoading(true);
    const safeRedirect = sanitizeRedirect(redirect);
    try {
      await sendOTP(email.trim());
      router.push(
        `/login/verify?email=${encodeURIComponent(email.trim())}&redirect=${encodeURIComponent(safeRedirect)}`
      );
    } catch (err: unknown) {
      const error = err as { response?: { status: number } };
      if (error?.response?.status === 400) {
        toast.info('Code already sent, check your email');
        router.push(
          `/login/verify?email=${encodeURIComponent(email.trim())}&redirect=${encodeURIComponent(safeRedirect)}`
        );
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
        className="w-full h-[48px] px-4 border border-gray-200 rounded-xl text-[14px] text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400 transition-all"
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
