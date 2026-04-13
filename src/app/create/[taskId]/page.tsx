'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { Button } from '@/components/ui/Button';
import { usePolling } from '@/lib/hooks/usePolling';
import { trackEvent } from '@/lib/analytics';
import { PENDING_SESSION_ID_KEY, PENDING_TASK_ID_KEY, saveVideo } from '@/lib/funnel';

function GeneratingView({ progress }: { progress: number }) {
  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center px-8 text-center">
      {/* Animated icon */}
      <div className="w-20 h-20 rounded-full bg-purple-500/15 flex items-center justify-center mb-8 animate-float">
        <svg aria-hidden="true" className="w-9 h-9 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
        </svg>
      </div>

      <h2 className="text-lg font-semibold text-white mb-1.5">
        Creating your video
      </h2>
      <p className="text-[13px] text-white/50 mb-8">Usually takes 5–10 minutes</p>

      {/* Progress bar */}
      <div className="w-full max-w-[240px]">
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-violet-500 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${Math.max(progress, 5)}%` }}
          />
        </div>
        <p className="text-[11px] text-white/30 mt-2">{progress}%</p>
      </div>
    </div>
  );
}

function CompletedView({ videoUrl, onDownload, onCreateAnother }: {
  videoUrl: string;
  onDownload: () => void;
  onCreateAnother: () => void;
}) {
  return (
    <div className="px-5 pt-4 pb-10">
      {/* Video player */}
      <div className="rounded-2xl overflow-hidden bg-black shadow-2xl mb-6">
        <video
          src={videoUrl}
          controls
          playsInline
          autoPlay
          className="w-full aspect-[9/16]"
        >
          <track kind="captions" />
        </video>
      </div>

      <div className="text-center mb-6">
        <h2 className="text-lg font-semibold text-white">Your video is ready</h2>
        <p className="text-[13px] text-white/50 mt-1">Save it and share with the world</p>
      </div>

      <div className="space-y-2.5">
        <Button variant="glow" size="lg" className="w-full" onClick={onDownload}>
          Download Video
        </Button>
        <Button variant="outline" size="lg" className="w-full" onClick={onCreateAnother}>
          Create Another
        </Button>
      </div>
    </div>
  );
}

function FailedView({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center px-8 text-center">
      <div className="w-16 h-16 rounded-full bg-red-500/15 flex items-center justify-center mb-6">
        <svg aria-hidden="true" className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-white mb-1.5">Generation failed</h2>
      <p className="text-[13px] text-white/50 mb-8 max-w-[260px]">
        Your payment went through, but we could not finish the video. Please try again or contact support.
      </p>
      <Button size="lg" className="w-full max-w-[260px]" onClick={onRetry}>
        Try Again
      </Button>
      <a href="mailto:support@elser.ai" className="text-[12px] text-purple-400 mt-4 hover:underline">
        Contact support
      </a>
    </div>
  );
}

function TimeoutView() {
  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center px-8 text-center">
      <div className="w-16 h-16 rounded-full bg-amber-500/15 flex items-center justify-center mb-6">
        <svg aria-hidden="true" className="w-7 h-7 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-white mb-1.5">Taking longer than expected</h2>
      <p className="text-[13px] text-white/50 max-w-[260px]">
        Your video is still being generated. Please stay on this page.
      </p>
      <a href="mailto:support@elser.ai" className="text-[12px] text-purple-400 mt-6 hover:underline">
        Contact support
      </a>
    </div>
  );
}

function ProgressContent() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.taskId as string;

  const { status, error, startPolling } = usePolling(taskId);

  useEffect(() => {
    // Save taskId so user can return after leaving
    localStorage.setItem(PENDING_TASK_ID_KEY, taskId);
    startPolling();
  }, [startPolling, taskId]);

  function handleDownload() {
    const videoUrl = status?.videos?.[0]?.videoUrl;
    if (!videoUrl) return;

    const a = document.createElement('a');
    a.href = videoUrl;
    a.download = `dance-like-me-${taskId}.mp4`;
    a.click();
    trackEvent('video_download', { taskId });
  }

  function handleRetry() {
    const savedSessionId = localStorage.getItem(PENDING_SESSION_ID_KEY);
    if (savedSessionId) {
      router.push(`/?session_id=${encodeURIComponent(savedSessionId)}`);
    } else {
      router.push('/');
    }
  }

  function handleCreateAnother() {
    localStorage.removeItem(PENDING_SESSION_ID_KEY);
    localStorage.removeItem(PENDING_TASK_ID_KEY);
    router.push('/');
  }

  if (error === 'timeout') {
    return <TimeoutView />;
  }

  if (error || status?.status === 'failed') {
    return <FailedView onRetry={handleRetry} />;
  }

  if (status?.status === 'completed' && status.videos?.[0]?.videoUrl) {
    localStorage.removeItem(PENDING_SESSION_ID_KEY);
    localStorage.removeItem(PENDING_TASK_ID_KEY);
    saveVideo({
      taskId,
      videoUrl: status.videos[0].videoUrl,
      createdAt: status.completedAt || new Date().toISOString(),
    });
    return (
      <CompletedView
        videoUrl={status.videos[0].videoUrl}
        onDownload={handleDownload}
        onCreateAnother={handleCreateAnother}
      />
    );
  }

  return <GeneratingView progress={status?.progress ?? 0} />;
}

export default function ProgressPage() {
  return (
    <AuthGuard>
      <ProgressContent />
    </AuthGuard>
  );
}
