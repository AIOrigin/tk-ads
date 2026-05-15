'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { trackEvent } from '@/lib/analytics';
import templates from '@/data/templates.json';
import type { Template } from '@/types/template';
import { isCreateInputMode } from '@/types/create';
import { getTaskRecoveryContent, type TaskFailureKind } from '@/lib/task-errors';
import {
  clearActiveOrderIfMatches,
  getActiveOrder,
  PENDING_CHARACTER_ID_KEY,
  PENDING_INPUT_MODE_KEY,
  PENDING_TEMPLATE_KEY,
  saveActiveOrder,
} from '@/lib/funnel';

const allTemplates = templates as Template[];
const TERMINAL_ORDER_STATUSES = new Set(['completed', 'failed', 'unlocked', 'canceled', 'cancelled', 'invalid']);

function isTerminalOrderStatus(status: string | null | undefined): boolean {
  return TERMINAL_ORDER_STATUSES.has((status || '').toLowerCase());
}

interface OrderState {
  orderId: string;
  status: string;
  progress: number;
  taskId: string | null;
  templateId: string;
  templateName: string | null;
  characterId: string | null;
  inputMode: string | null;
  email: string;
  unlocked: boolean;
  previewEmailSentAt: string | null;
  unlockEmailSentAt: string | null;
  previewVideoUrl: string | null;
  originalVideoUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
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
  const router = useRouter();
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
  const recoveryTrackedRef = useRef<string | null>(null);

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
        if ([400, 401, 403, 404, 410].includes(response.status)) {
          clearActiveOrderIfMatches(orderId);
        }
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
    if (!order) return;

    if (isTerminalOrderStatus(order.status)) {
      clearActiveOrderIfMatches(order.orderId);
      return;
    }

    if (isWorking) {
      saveActiveOrder({
        orderId: order.orderId,
        token,
        taskId: order.taskId,
        email: order.email,
      });
    }
  }, [isWorking, order, token]);

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
    if (!order || order.status !== 'failed') return;
    const recovery = getTaskRecoveryContent(order.errorMessage, order.errorCode);
    const trackingKey = `${order.orderId}:${recovery.kind}`;
    if (recoveryTrackedRef.current === trackingKey) return;
    recoveryTrackedRef.current = trackingKey;

    trackEvent('generation_recovery_shown', {
      orderId: order.orderId,
      taskId: order.taskId || '',
      reason: recovery.kind,
      surface: 'order_page',
    });
  }, [order]);

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

  function saveOrderDraft() {
    if (!order) return;

    const template = allTemplates.find((item) => item.id === order.templateId);
    if (template) {
      localStorage.setItem(PENDING_TEMPLATE_KEY, JSON.stringify(template));
    }
    if (order.characterId) {
      localStorage.setItem(PENDING_CHARACTER_ID_KEY, order.characterId);
    }
    if (isCreateInputMode(order.inputMode)) {
      localStorage.setItem(PENDING_INPUT_MODE_KEY, order.inputMode);
    }
  }

  function handleTryAnotherLook() {
    saveOrderDraft();
    router.push('/?resume=1');
  }

  function handlePrepareAnotherVideo() {
    if (order) {
      saveActiveOrder({
        orderId: order.orderId,
        token,
        taskId: order.taskId,
        email: order.email,
      });
    }
    saveOrderDraft();
    router.push('/?resume=1');
  }

  function handleGenerationRecovery(kind: TaskFailureKind) {
    if (!order) return;

    if (kind === 'concurrency') {
      const activeOrder = getActiveOrder();
      if (activeOrder && activeOrder.orderId !== order.orderId) {
        trackEvent('generation_retry_click', {
          orderId: order.orderId,
          taskId: order.taskId || '',
          reason: kind,
          action: 'view_current_video',
        });
        router.push(`/order/${encodeURIComponent(activeOrder.orderId)}?token=${encodeURIComponent(activeOrder.token)}`);
        return;
      }
    }

    saveOrderDraft();

    if (kind === 'invalid_input') {
      trackEvent('photo_reupload_click', {
        orderId: order.orderId,
        taskId: order.taskId || '',
        reason: kind,
      });
      router.push('/?resume=1&reupload=1');
      return;
    }

    trackEvent('generation_retry_click', {
      orderId: order.orderId,
      taskId: order.taskId || '',
      reason: kind,
      action: 'resume_draft',
    });
    router.push('/?resume=1');
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
  const recovery = getTaskRecoveryContent(order.errorMessage, order.errorCode);
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
    <div className="h-[100dvh] overflow-hidden bg-dark-gradient text-white">
      <div className="mx-auto flex h-[100dvh] max-w-lg flex-col px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-[max(12px,env(safe-area-inset-top))] sm:px-5 sm:pt-6">
        <div className="mb-3 shrink-0 px-1">
          <h1 className="text-[21px] font-bold leading-[1.12] tracking-tight sm:text-[22px]">
            {failed
              ? recovery.title
              : displayVideoUrl
                ? order.unlocked
                  ? 'Your video is ready'
                  : 'Your preview is ready'
                : "We're creating your video"}
          </h1>
          <p className="mt-1.5 text-[12px] leading-[1.35] text-white/45 sm:text-[13px]">
            {failed ? (
              <>Your dance and character choices are saved.</>
            ) : previewInProgress ? (
              <>
                We&apos;ll email your video link to {order.email}{' '}
                when it&apos;s ready. This usually takes 5 to 10 minutes.
              </>
            ) : (
              <>We will send the video link to {order.email}.</>
            )}
          </p>
        </div>

        {failed ? (
          <div className="mb-3 flex min-h-0 flex-1 flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.045] p-6 text-center">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-purple-500/15 ring-1 ring-purple-300/15">
              <svg aria-hidden="true" className="h-7 w-7 text-purple-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m5-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-[18px] font-semibold text-white">{recovery.title}</h2>
            <p className="mt-2 max-w-[280px] text-[14px] leading-5 text-white/55">
              {recovery.message}
            </p>
            <Button
              variant="glow"
              size="lg"
              className="mt-7 h-12 w-full max-w-[260px] rounded-[20px] text-[15px]"
              onClick={() => handleGenerationRecovery(recovery.kind)}
            >
              {recovery.primaryAction}
            </Button>
            <a href="mailto:support@elser.ai" className="mt-4 text-[12px] font-semibold text-purple-300 hover:underline">
              Contact support
            </a>
          </div>
        ) : displayVideoUrl && displayVariant ? (
          <div className="mb-3 flex min-h-0 flex-1 items-center justify-center">
            <button
              type="button"
              aria-label={openVideoLabel}
              onClick={() => handleDownload(displayVariant)}
              className="group relative aspect-[9/16] h-full max-h-[52dvh] max-w-full overflow-hidden rounded-[22px] bg-black text-left shadow-2xl"
            >
              <video
                key={displayVideoUrl}
                src={displayVideoUrl}
                playsInline
                muted
                autoPlay
                loop
                preload="auto"
                className="h-full w-full bg-black object-cover pointer-events-none"
              >
                <track kind="captions" />
              </video>
              <div className="absolute inset-0 flex items-center justify-center bg-black/10 transition group-active:bg-black/20">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/55 ring-1 ring-white/25 backdrop-blur-sm sm:h-16 sm:w-16">
                  <svg aria-hidden="true" className="ml-1 h-7 w-7 text-white sm:h-8 sm:w-8" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
              </div>
            </button>
          </div>
        ) : (
          <div className="mb-3 flex min-h-0 flex-1 flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-8 text-center">
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

        {!failed && isWorking ? (
          <div className="shrink-0 space-y-2 px-1">
            <Button
              variant="secondary"
              size="lg"
              className="h-12 w-full rounded-[20px] border border-white/10 bg-white/[0.06] text-[15px] text-white hover:bg-white/[0.1] active:bg-white/[0.14]"
              onClick={handlePrepareAnotherVideo}
            >
              Prepare another video
            </Button>
            <p className="px-2 text-center text-[12px] text-white/40">
              This video will keep generating while you edit the next one.
            </p>
          </div>
        ) : null}

        {!failed && completed && (previewReady || originalReady) ? (
          <div className="shrink-0 space-y-2 px-1">
            {order.unlocked ? (
              originalReady ? (
                <Button variant="glow" size="lg" className="h-12 w-full rounded-[20px] text-[15px]" onClick={() => handleDownload('original')}>
                  Open Original Video
                </Button>
              ) : null
            ) : (
              <Button variant="glow" size="lg" className="h-12 w-full rounded-[20px] text-[15px]" isLoading={isUnlocking} onClick={handleUnlock}>
                Get Original for $0.55
              </Button>
            )}
            <Button
              variant="secondary"
              size="md"
              className="h-10 w-full rounded-[16px] border border-white/10 bg-white/[0.06] text-[13px] text-white hover:bg-white/[0.1] active:bg-white/[0.14]"
              onClick={handleTryAnotherLook}
            >
              Try another look
            </Button>
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
