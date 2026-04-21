'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { OTPInput, type OTPInputHandle } from '@/components/auth/OTPInput';
import { sendOTP, verifyOTP, getMe } from '@/lib/api/user-api';
import { useAuthStore } from '@/lib/store/auth-store';
import { trackEvent, identifyUser } from '@/lib/analytics';
import { BottomSheet } from '@/components/ui/BottomSheet';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  variant?: 'centered' | 'sheet';
}

export function AuthModal({ isOpen, onClose, onSuccess, variant = 'sheet' }: AuthModalProps) {
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  
  const otpRef = useRef<OTPInputHandle>(null);
  const setAuth = useAuthStore((s) => s.setAuth);

  const resetState = useCallback(() => {
    setStep('email');
    setEmail('');
    setIsLoading(false);
    setError(false);
    setResendCooldown(0);
  }, []);

  const handleClose = useCallback(() => {
    onClose();
    setTimeout(resetState, 300); // Wait for transition before resetting
  }, [onClose, resetState]);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsLoading(true);
    trackEvent('login_start', { method: 'email' });
    
    try {
      await sendOTP(email.trim());
      setStep('otp');
    } catch (err: unknown) {
      const error = err as { response?: { status: number } };
      if (error?.response?.status === 400) {
        toast.info('Code already sent, check your email');
        setStep('otp');
      } else {
        toast.error('Failed to send code. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleOTPComplete = async (code: string) => {
    setIsLoading(true);
    setError(false);
    
    try {
      let accessToken: string;
      let isFirstLogin: boolean;
      
      try {
        trackEvent('login_verify_submit', { method: 'email' });
        const result = await verifyOTP(email.trim(), code);
        accessToken = result.accessToken;
        isFirstLogin = result.isFirstLogin;
      } catch (err: unknown) {
        setError(true);
        const verifyErr = err as { response?: { status: number } };
        if (verifyErr?.response?.status === 401) {
          toast.error('Code expired, please resend');
        } else {
          toast.error('Invalid code, please try again');
        }
        setIsLoading(false);
        setTimeout(() => {
          setError(false);
          otpRef.current?.reset();
        }, 600);
        return;
      }

      // Code verified successfully
      const { setToken } = await import('@/lib/api/client');
      setToken(accessToken);
      const userInfo = await getMe();
      setAuth(accessToken, userInfo);
      await identifyUser(userInfo.email, userInfo.id);
      trackEvent(isFirstLogin ? 'sign_up' : 'login', { method: 'email' });
      
      onSuccess();
      handleClose();
    } catch {
      toast.error('Sign-in succeeded but failed to load profile. Please refresh.');
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      await sendOTP(email.trim());
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
  };

  const content = (
    <div className="flex flex-col text-white pt-1 pb-2">
      {step === 'email' ? (
        <>
          <div className="text-center mb-5">
            <h2 className="text-lg font-bold tracking-tight">Sign in to continue</h2>
          </div>
          <form onSubmit={handleEmailSubmit} className="space-y-3">
            <input
              type="email"
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full h-11 px-4 border border-white/15 rounded-xl text-sm bg-white/[0.06] placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400 transition-all"
            />
            <Button
              type="submit"
              className="w-full h-11 text-[15px]"
              isLoading={isLoading}
              disabled={!email.trim()}
            >
              Send Code
            </Button>
          </form>
        </>
      ) : (
        <>
          <button 
            type="button" 
            onClick={() => setStep('email')} 
            className="text-white/50 self-start mb-4 hover:text-white/80 transition-colors flex items-center gap-1 text-[13px]"
          >
            <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Back
          </button>
          <div className="text-center mb-5">
            <h2 className="text-lg font-bold mb-1">Enter the code</h2>
            <p className="text-xs text-white/50">
              sent to <span className="font-medium text-white">{email}</span>
            </p>
          </div>
          <div className="space-y-5">
            <OTPInput ref={otpRef} onComplete={handleOTPComplete} error={error} />
            {isLoading && (
              <div className="flex justify-center">
                <div className="w-5 h-5 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            <div className="text-center">
              <p className="text-[11px] text-white/40 mb-1.5">Didn't get the code?</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={handleResend}
                disabled={resendCooldown > 0}
              >
                {resendCooldown > 0 ? `Resend (${resendCooldown}s)` : 'Resend Code'}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );

  if (variant === 'sheet') {
    return (
      <BottomSheet isOpen={isOpen} onClose={handleClose}>
        {content}
      </BottomSheet>
    );
  }

  // Centered Modal Variant
  return (
    <>
      <button
        type="button"
        aria-label="Close modal"
        className={`fixed inset-0 bg-black/40 z-40 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={handleClose}
      />
      <div 
        className={`fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none transition-all duration-300 ${
          isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
      >
        <div className={`bg-[#1a1a1a] border border-white/10 w-full max-w-[320px] rounded-2xl p-5 shadow-2xl relative ${isOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}>
          <button 
            onClick={handleClose}
            className="absolute top-3 right-3 text-white/40 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          {content}
        </div>
      </div>
    </>
  );
}
