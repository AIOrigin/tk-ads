'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';

interface OrderState {
  orderId: string;
  status: string;
  progress: number;
  taskId: string | null;
  templateName: string | null;
  email: string;
  unlocked: boolean;
  previewEmailSentAt: string | null;
  unlockEmailSentAt: string | null;
  previewVideoUrl: string | null;
  originalVideoUrl: string | null;
}

function OrderLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-dark-gradient text-white">
      <div className="mb-4 h-10 w-10 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
      <p className="text-[15px] font-medium">Loading your video...</p>
    </div>
  );
}

function OrderContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const orderId = params.orderId as string;
  const token = searchParams.get('token') || '';
  const shouldDownload = searchParams.get('download');
  const returnedUnlocked = searchParams.get('unlocked') === '1';
  const returnedCanceled = searchParams.get('canceled') === '1';
  const [order, setOrder] = useState<OrderState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const openedDownloadRef = useRef(false);
  const notifiedReturnRef = useRef(false);

  const buildVideoUrl = useCallback(
    (variant: 'preview' | 'original') => {
      const query = new URLSearchParams({
        token,
        variant,
      });
      return `/api/orders/${encodeURIComponent(orderId)}/download?${query.toString()}`;
    },
    [orderId, token]
  );

  const isWorking = useMemo(() => {
    const status = (order?.status || '').toLowerCase();
    const awaitingPreview =
      ['completed', 'unlocked'].includes(status) && !order?.previewVideoUrl && !order?.originalVideoUrl;
    return !status || awaitingPreview || ['created', 'pending', 'processing', 'queued', 'submitted'].includes(status);
  }, [order?.originalVideoUrl, order?.previewVideoUrl, order?.status]);

  const loadOrder = useCallback(async () => {
    if (!orderId || !token) {
      setError('This video link is missing its access token.');
      return;
    }

    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}?token=${encodeURIComponent(token)}`, {
        cache: 'no-store',
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load order');
      }
      setOrder(payload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load order');
    }
  }, [orderId, token]);

  useEffect(() => {
    void loadOrder();
  }, [loadOrder]);

  useEffect(() => {
    if (!isWorking) return;
    const timer = window.setInterval(() => {
      void loadOrder();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [isWorking, loadOrder]);

  useEffect(() => {
    if (notifiedReturnRef.current) return;
    if (returnedUnlocked) {
      notifiedReturnRef.current = true;
      toast.success('Payment confirmed. We will email your original video link.');
    } else if (returnedCanceled) {
      notifiedReturnRef.current = true;
      toast.info('Payment was canceled. Your preview is still available.');
    }
  }, [returnedCanceled, returnedUnlocked]);

  useEffect(() => {
    if (!shouldDownload || openedDownloadRef.current || !order) return;
    const variant = shouldDownload === 'original' ? 'original' : 'preview';
    if (variant === 'preview' && order.previewVideoUrl) {
      openedDownloadRef.current = true;
      window.location.href = buildVideoUrl('preview');
    }
    if (variant === 'original' && order.unlocked && order.originalVideoUrl) {
      openedDownloadRef.current = true;
      window.location.href = buildVideoUrl('original');
    }
  }, [buildVideoUrl, order, shouldDownload]);

  async function handleUnlock() {
    setIsUnlocking(true);
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to start checkout');
      }
      window.location.href = payload.url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start checkout');
      setIsUnlocking(false);
    }
  }

  function handleDownload(variant: 'preview' | 'original') {
    window.location.href = buildVideoUrl(variant);
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-dark-gradient px-8 text-center text-white">
        <h1 className="mb-2 text-lg font-semibold">Video link unavailable</h1>
        <p className="mb-6 max-w-[280px] text-[13px] text-white/50">{error}</p>
        <a href="mailto:support@elser.ai" className="text-[13px] font-semibold text-purple-300">
          Contact support
        </a>
      </div>
    );
  }

  if (!order) return <OrderLoading />;

  const completed = ['completed', 'unlocked'].includes(order.status);
  const failed = order.status === 'failed';
  const displayVariant = order.previewVideoUrl
    ? 'preview'
    : order.unlocked && order.originalVideoUrl
      ? 'original'
      : null;
  const displayVideoUrl = order.previewVideoUrl || (order.unlocked ? order.originalVideoUrl : null);
  const openVideoLabel = displayVariant === 'original' ? 'Open original video' : 'Open watermarked preview';
  const previewReady = Boolean(order.previewVideoUrl);
  const originalReady = Boolean(order.unlocked && order.originalVideoUrl);
  const awaitingWatermark = !failed && !displayVideoUrl && (order.progress || 0) >= 100;
  const previewInProgress = !failed && !displayVideoUrl;

  return (
    <div className="min-h-screen bg-dark-gradient text-white">
      <div className="mx-auto max-w-lg px-5 pb-10 pt-6">
        <div className="mb-5 px-1">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-white/35">
            Dance Like Me
          </p>
          <h1 className="text-[22px] font-bold leading-[1.15] tracking-tight">
            {failed
              ? 'Generation failed'
              : displayVideoUrl
                ? order.unlocked
                  ? 'Your video is ready'
                  : 'Your preview is ready'
                : 'Your preview is being created'}
          </h1>
          <p className="mt-2 text-[13px] text-white/45">
            {previewInProgress ? (
              <>
                We&apos;ll email the video link to {order.email}{' '}
                when it&apos;s ready. This usually takes 10 minutes or more.
              </>
            ) : (
              <>We will send the video link to {order.email}.</>
            )}
          </p>
        </div>

        {failed ? (
          <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-5 text-center">
            <p className="text-[14px] text-red-100">
              We could not finish this video. Please try again or contact support.
            </p>
          </div>
        ) : displayVideoUrl && displayVariant ? (
          <button
            type="button"
            aria-label={openVideoLabel}
            onClick={() => handleDownload(displayVariant)}
            className="group relative mb-5 block w-full overflow-hidden rounded-2xl bg-black text-left shadow-2xl"
          >
            <video
              key={displayVideoUrl}
              src={displayVideoUrl}
              playsInline
              muted
              autoPlay
              loop
              preload="auto"
              className="aspect-[9/16] w-full bg-black object-contain pointer-events-none"
            >
              <track kind="captions" />
            </video>
            <div className="absolute inset-0 flex items-center justify-center bg-black/10 transition group-active:bg-black/20">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/55 ring-1 ring-white/25 backdrop-blur-sm">
                <svg aria-hidden="true" className="ml-1 h-8 w-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            </div>
          </button>
        ) : (
          <div className="mb-6 flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-8 text-center">
            <div className="mb-5 h-12 w-12 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
            <p className="text-[15px] font-medium">
              {awaitingWatermark ? 'Preparing your watermarked preview' : 'Generating your video'}
            </p>
            <p className="mt-1 text-[13px] text-white/45">
              {awaitingWatermark
                ? 'The video finished processing. We are waiting for the preview link.'
                : 'You can close this page. We will keep working.'}
            </p>
            <div className="mt-7 w-full max-w-[240px]">
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-purple-500 to-violet-500 transition-all duration-700"
                  style={{ width: `${Math.max(order.progress || 0, 5)}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] text-white/30">{Math.round(order.progress || 0)}%</p>
            </div>
          </div>
        )}

        {!failed && completed && (previewReady || originalReady) ? (
          <div className="space-y-2.5">
            {order.unlocked ? (
              originalReady ? (
                <Button variant="glow" size="lg" className="w-full" onClick={() => handleDownload('original')}>
                  Open Original Video
                </Button>
              ) : null
            ) : (
              <Button variant="glow" size="lg" className="w-full" isLoading={isUnlocking} onClick={handleUnlock}>
                Get Original for $1.99
              </Button>
            )}
            {order.unlocked ? (
              <p className="px-2 pt-1 text-center text-[12px] text-white/40">
                The original link will also be sent to your email.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function OrderPageClient() {
  return (
    <Suspense fallback={<OrderLoading />}>
      <OrderContent />
    </Suspense>
  );
}

const ClientOnlyOrderPage = dynamic(async () => OrderPageClient, {
  ssr: false,
  loading: () => <OrderLoading />,
});

export default function OrderPage() {
  return <ClientOnlyOrderPage />;
}
