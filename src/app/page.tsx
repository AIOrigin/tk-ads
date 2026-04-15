'use client';

import { useState, useCallback, useRef, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { useCreateStore } from '@/lib/store/create-store';
import { PhotoUploader } from '@/components/create/PhotoUploader';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { getToken } from '@/lib/api/client';
import { getCredits, getTotalCredits } from '@/lib/api/user-api';
import { trackEvent, generateEventId, getTikTokClickId, getTikTokTtp } from '@/lib/analytics';
import { PRICE_DISPLAY } from '@/lib/constants';
import templates from '@/data/templates.json';
import type { Template } from '@/types/template';
import {
  buildLoginRedirect,
  getCurrentPathWithSearch,
  getSavedVideos,
  PENDING_PHOTO_READY_KEY,
  PENDING_SESSION_ID_KEY,
  PENDING_TASK_ID_KEY,
  PENDING_TEMPLATE_KEY,
  PHOTO_DB_NAME,
  PHOTO_KEY,
  PHOTO_STORE,
  type SavedVideo,
} from '@/lib/funnel';

const allTemplates = templates as Template[];

// --- IndexedDB helpers ---
function openPhotoDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PHOTO_DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(PHOTO_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function savePhotoToDB(file: File): Promise<void> {
  const db = await openPhotoDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, 'readwrite');
    tx.objectStore(PHOTO_STORE).put(file, PHOTO_KEY);
    tx.oncomplete = () => {
      localStorage.setItem(PENDING_PHOTO_READY_KEY, '1');
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

async function loadPhotoFromDB(): Promise<File | null> {
  const db = await openPhotoDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, 'readonly');
    const req = tx.objectStore(PHOTO_STORE).get(PHOTO_KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function clearPhotoDB(): Promise<void> {
  const db = await openPhotoDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, 'readwrite');
    tx.objectStore(PHOTO_STORE).delete(PHOTO_KEY);
    tx.oncomplete = () => {
      localStorage.removeItem(PENDING_PHOTO_READY_KEY);
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

// --- Dance Selector (horizontal scroll) ---
function DanceSelector({
  selected,
  onSelect,
}: {
  selected: Template;
  onSelect: (t: Template) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="mb-5">
      <p className="text-[11px] uppercase tracking-wider text-white/40 font-medium mb-2.5 px-1">
        Choose a dance
      </p>
      <div
        ref={scrollRef}
        className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {allTemplates.map((t) => {
          const isActive = t.id === selected.id;
          return (
            <button
              type="button"
              key={t.id}
              onClick={() => onSelect(t)}
              className={`flex-shrink-0 w-20 snap-start transition-all duration-200 ${
                isActive ? 'scale-105' : 'opacity-60'
              }`}
            >
              <div
                className={`aspect-[9/16] rounded-xl overflow-hidden relative ${
                  isActive
                    ? 'ring-2 ring-purple-500 shadow-[0_0_12px_rgba(168,85,247,0.4)]'
                    : ''
                }`}
              >
                <video
                  src={t.motionVideoUrl}
                  autoPlay
                  loop
                  muted
                  playsInline
                  preload="auto"
                  className="w-full h-full object-cover"
                />
                {/* Duration */}
                <div className="absolute bottom-1 right-1 bg-black/60 text-[9px] text-white px-1 py-0.5 rounded">
                  {t.durationSeconds}s
                </div>
              </div>
              <p className={`text-[10px] mt-1 text-center truncate ${
                isActive ? 'text-white font-medium' : 'text-white/40'
              }`}>
                {t.name}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// --- My Videos ---
function MyVideos({ videos }: { videos: SavedVideo[] }) {
  const router = useRouter();
  if (videos.length === 0) return null;

  return (
    <div className="mb-4">
      <div
        className="flex gap-2 overflow-x-auto"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {videos.map((v) => (
          <button
            type="button"
            key={v.taskId}
            onClick={() => router.push(`/create/${v.taskId}`)}
            className="flex-shrink-0 w-14"
          >
            <div className="aspect-[9/16] rounded-lg overflow-hidden relative bg-white/[0.06] ring-1 ring-white/10">
              <video
                src={v.videoUrl}
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-5 h-5 rounded-full bg-white/25 flex items-center justify-center">
                  <svg aria-hidden="true" className="w-2.5 h-2.5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// --- Bottom Sheet ---
function BottomSheet({
  isOpen,
  onClose,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Prevent pull-to-refresh when sheet is open
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('no-overscroll');
      document.documentElement.classList.add('no-overscroll');
    } else {
      document.body.classList.remove('no-overscroll');
      document.documentElement.classList.remove('no-overscroll');
    }
    return () => {
      document.body.classList.remove('no-overscroll');
      document.documentElement.classList.remove('no-overscroll');
    };
  }, [isOpen]);
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const currentY = useRef(0);
  const isDragging = useRef(false);
  const sheetHeight = useRef(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Only drag from handle area or when content is scrolled to top
    if (contentRef.current && contentRef.current.scrollTop > 0) return;
    startY.current = e.touches[0].clientY;
    currentY.current = 0;
    isDragging.current = true;
    sheetHeight.current = sheetRef.current?.offsetHeight || 400;
    if (sheetRef.current) {
      sheetRef.current.style.transition = 'none';
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) {
      e.preventDefault();
    }
    // Only allow dragging down, with slight rubber-band resistance for upward
    const clampedDelta = delta < 0 ? delta * 0.1 : delta;
    currentY.current = clampedDelta;

    if (sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${Math.max(0, clampedDelta)}px)`;
    }
    // Fade backdrop proportionally
    if (backdropRef.current && sheetHeight.current > 0) {
      const progress = Math.min(Math.max(0, clampedDelta) / sheetHeight.current, 1);
      backdropRef.current.style.opacity = String(1 - progress);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;

    if (sheetRef.current) {
      sheetRef.current.style.transition = '';
    }
    if (backdropRef.current) {
      backdropRef.current.style.opacity = '';
    }

    // Close if dragged past 30% of sheet height or with fast velocity
    if (currentY.current > sheetHeight.current * 0.3) {
      if (sheetRef.current) {
        sheetRef.current.style.transform = '';
      }
      onClose();
    } else {
      // Snap back
      if (sheetRef.current) {
        sheetRef.current.style.transform = 'translateY(0)';
      }
    }
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <button
        ref={backdropRef}
        type="button"
        aria-label="Close sheet"
        className={`fixed inset-0 bg-black/60 z-40 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />
      {/* Sheet */}
      <div
        ref={sheetRef}
        className={`fixed inset-x-0 bottom-0 z-50 transition-transform duration-300 ease-out ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          ref={contentRef}
          className="bg-[#1a1a1a] rounded-t-3xl max-h-[85vh] overflow-y-auto"
        >
          {/* Handle */}
          <div className="sticky top-0 z-10 flex justify-center pt-3 pb-2 bg-[#1a1a1a] rounded-t-3xl cursor-grab active:cursor-grabbing">
            <div className="w-9 h-[5px] rounded-full bg-white/30" />
          </div>
          <div className="px-5 pb-8 pt-1">{children}</div>
        </div>
      </div>
    </>
  );
}

// --- Main Page ---
function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const canceled = searchParams.get('canceled');
  const shouldResume = searchParams.get('resume') === '1';

  // If there's a pending task, resume to its progress page
  useEffect(() => {
    if (sessionId || canceled || shouldResume) return; // don't redirect if explicitly coming back
    const pendingTaskId = localStorage.getItem(PENDING_TASK_ID_KEY);
    if (pendingTaskId) {
      router.replace(`/create/${pendingTaskId}`);
    }
  }, [router, sessionId, canceled, shouldResume]);

  const { isAuthenticated } = useAuth();
  const { selectTemplate } = useCreateStore();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedDance, setSelectedDance] = useState<Template>(allTemplates[0]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [hasSavedPhoto, setHasSavedPhoto] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paidTemplateRecovered, setPaidTemplateRecovered] = useState(false);
  const [myVideos, setMyVideos] = useState<SavedVideo[]>([]);

  // Load saved videos on mount
  useEffect(() => {
    setMyVideos(getSavedVideos());
  }, []);

  const resolveTemplateById = useCallback((templateId: string | null | undefined) => {
    if (!templateId) return null;
    return allTemplates.find((template) => template.id === templateId) ?? null;
  }, []);

  const restorePendingTemplate = useCallback(() => {
    const pendingRaw = localStorage.getItem(PENDING_TEMPLATE_KEY);
    if (!pendingRaw) return false;

    try {
      const pendingTemplate = JSON.parse(pendingRaw) as Template;
      const matchedTemplate = resolveTemplateById(pendingTemplate.id);

      if (matchedTemplate) {
        setSelectedDance(matchedTemplate);
      }

      return true;
    } catch {
      return false;
    }
  }, [resolveTemplateById]);

  const fetchPaidSessionInfo = useCallback(async () => {
    if (!sessionId) return null;

    const token = getToken();
    const response = await fetch(`/api/checkout-session?session_id=${encodeURIComponent(sessionId)}`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (response.status === 401) {
      router.replace(buildLoginRedirect(getCurrentPathWithSearch()));
      return null;
    }

    if (!response.ok) {
      return null;
    }

    return response.json() as Promise<{
      sessionId: string;
      paymentStatus: string;
      templateId: string | null;
      taskId: string | null;
      generationStatus: string | null;
      paid: boolean;
    }>;
  }, [router, sessionId]);

  const restorePendingState = useCallback(async () => {
    const hasTemplate = restorePendingTemplate();
    if (!hasTemplate) return false;

    try {
      const savedPhoto = await loadPhotoFromDB();
      if (savedPhoto) {
        setPhotoFile(savedPhoto);
        setHasSavedPhoto(true);
      }

      setSheetOpen(true);
      return true;
    } catch {
      return false;
    }
  }, [restorePendingTemplate]);

  useEffect(() => {
    if (!shouldResume) return;
    void restorePendingState();
  }, [restorePendingState, shouldResume]);

  useEffect(() => {
    if (!shouldResume && !canceled) return;
    if (photoFile) return;

    if (localStorage.getItem(PENDING_PHOTO_READY_KEY) === '1') {
      setHasSavedPhoto(true);
    }

    if (!restorePendingTemplate()) return;

    void loadPhotoFromDB().then((savedPhoto) => {
      if (savedPhoto) {
        setPhotoFile(savedPhoto);
        setHasSavedPhoto(true);
      }
    });
  }, [canceled, photoFile, restorePendingTemplate, shouldResume]);

  // Handle Stripe cancel
  useEffect(() => {
    if (canceled) {
      void restorePendingState().then((restored) => {
        toast.info(
          restored
            ? 'Payment was not completed. Your dance and photo are still saved.'
            : 'Payment was not completed. Please choose your dance and upload a photo again.'
        );
        setSheetOpen(true);
      });
    }
  }, [canceled, restorePendingState]);

  // Handle Stripe success redirect
  useEffect(() => {
    if (!sessionId) return;

    async function handlePaymentSuccess() {
      setIsProcessing(true);
      try {
        // Recover template info saved before Stripe redirect for TikTok content_id/content_name
        const savedRaw = localStorage.getItem(PENDING_TEMPLATE_KEY);
        let savedTemplate: Template | null = null;
        try { savedTemplate = savedRaw ? JSON.parse(savedRaw) as Template : null; } catch { /* ignore */ }
        const purchaseEventId = generateEventId();
        trackEvent('payment_complete', {
          amount: 1.99,
          sessionId: sessionId!,
          templateId: savedTemplate?.id || '',
          templateName: savedTemplate?.name || '',
          eventId: purchaseEventId,
        });

        const paidSessionInfo = await fetchPaidSessionInfo();
        if (paidSessionInfo?.taskId) {
          localStorage.setItem(PENDING_SESSION_ID_KEY, sessionId!);
          router.replace(`/create/${paidSessionInfo.taskId}`);
          return;
        }

        const pendingRaw = localStorage.getItem(PENDING_TEMPLATE_KEY);
        const storedTemplate = pendingRaw ? (JSON.parse(pendingRaw) as Template) : null;
        const template = storedTemplate ?? resolveTemplateById(paidSessionInfo?.templateId);

        if (!template) {
          toast.error('We found your payment, but could not recover your draft. Please contact support before retrying payment.');
          setIsProcessing(false);
          setSheetOpen(true);
          return;
        }

        if (!storedTemplate) {
          setSelectedDance(template);
          localStorage.setItem(PENDING_TEMPLATE_KEY, JSON.stringify(template));
          setPaidTemplateRecovered(true);
        }

        const photo = await loadPhotoFromDB();
        if (!photo) {
          toast.error('Payment confirmed. Please re-upload your photo to finish your video without paying again.');
          setIsProcessing(false);
          setHasSavedPhoto(false);
          setSheetOpen(true);
          return;
        }

        const formData = new FormData();
        formData.append('session_id', sessionId!);
        formData.append('motion_video_url', template.motionVideoUrl);
        formData.append('mode', template.mode);
        formData.append('character_orientation', template.characterOrientation);
        formData.append('duration_seconds', String(template.durationSeconds));
        formData.append('photo', photo);
        formData.append('tt_event_id', purchaseEventId);
        formData.append('tt_template_id', template.id);
        formData.append('tt_template_name', template.name);
        const ttclid = getTikTokClickId();
        const ttp = getTikTokTtp();
        if (ttclid) formData.append('tt_ttclid', ttclid);
        if (ttp) formData.append('tt_ttp', ttp);

        const token = getToken();
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: formData,
        });

        const result = await res.json();
        if (!res.ok) {
          if (res.status === 401) {
            router.replace(buildLoginRedirect(getCurrentPathWithSearch()));
            return;
          }

          if (sessionId) {
            toast.error(result.error || 'Payment confirmed, but generation failed. Fix your draft below and continue without paying again.');
          } else {
            toast.error(result.error || 'Generation failed');
          }

          setIsProcessing(false);
          setSheetOpen(true);
          return;
        }

        trackEvent('generation_start', {
          templateId: template.id,
          taskId: result.task_id,
        });

        localStorage.removeItem(PENDING_TEMPLATE_KEY);
        localStorage.setItem(PENDING_SESSION_ID_KEY, sessionId!);
        await clearPhotoDB();

        router.replace(`/create/${result.task_id}`);
      } catch {
        toast.error('Something went wrong. Please try again.');
        setIsProcessing(false);
        setSheetOpen(true);
      }
    }

    handlePaymentSuccess();
  }, [fetchPaidSessionInfo, resolveTemplateById, router, sessionId]);

  const handleFileSelected = useCallback((file: File) => {
    setPhotoFile(file);
    setHasSavedPhoto(true);
  }, []);

  async function handlePay() {
    if (!selectedDance) return;

    const effectivePhoto = photoFile ?? (await loadPhotoFromDB());
    if (!effectivePhoto) return;

    if (!photoFile) {
      setPhotoFile(effectivePhoto);
      setHasSavedPhoto(true);
    }

    // If not logged in, redirect to login first
    if (!isAuthenticated) {
      // Save state so we can resume after login
      selectTemplate(selectedDance);
      await savePhotoToDB(effectivePhoto);
      localStorage.setItem(PENDING_TEMPLATE_KEY, JSON.stringify(selectedDance));
      router.push(buildLoginRedirect('/?resume=1'));
      return;
    }

    setIsProcessing(true);

    try {
      await savePhotoToDB(effectivePhoto);
      localStorage.setItem(PENDING_TEMPLATE_KEY, JSON.stringify(selectedDance));

      // Check if user has enough credits to skip payment
      const creditsNeeded = Math.ceil((selectedDance.mode === '720p' ? 17 : 26) * selectedDance.durationSeconds * 1.8);
      let hasEnoughCredits = false;
      try {
        const credits = await getCredits();
        const total = getTotalCredits(credits);
        hasEnoughCredits = total >= creditsNeeded;
      } catch { /* ignore — will fall through to payment */ }

      if (hasEnoughCredits) {
        // Generate directly using existing credits
        const formData = new FormData();
        formData.append('motion_video_url', selectedDance.motionVideoUrl);
        formData.append('mode', selectedDance.mode);
        formData.append('character_orientation', selectedDance.characterOrientation);
        formData.append('duration_seconds', String(selectedDance.durationSeconds));
        formData.append('photo', effectivePhoto);

        const token = getToken();
        const response = await fetch('/api/generate-free', {
          method: 'POST',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: formData,
        });

        const result = await response.json();

        if (response.ok && result.task_id) {
          trackEvent('generation_start', {
            templateId: selectedDance.id,
            taskId: result.task_id,
          });

          localStorage.removeItem(PENDING_TEMPLATE_KEY);
          localStorage.setItem(PENDING_SESSION_ID_KEY, 'credits');
          await clearPhotoDB();
          router.replace(`/create/${result.task_id}`);
          return;
        }

        // If 402 (insufficient credits), fall through to payment
        if (response.status !== 402) {
          throw new Error(result.error || 'Generation failed');
        }
      }

      // Fall through to Stripe payment flow
      const checkoutEventId = generateEventId();
      trackEvent('payment_start', {
        templateId: selectedDance.id,
        templateName: selectedDance.name,
        amount: 1.99,
        eventId: checkoutEventId,
      });

      if (sessionId) {
        const resumeEventId = generateEventId();
        const formData = new FormData();
        formData.append('session_id', sessionId);
        formData.append('motion_video_url', selectedDance.motionVideoUrl);
        formData.append('mode', selectedDance.mode);
        formData.append('character_orientation', selectedDance.characterOrientation);
        formData.append('duration_seconds', String(selectedDance.durationSeconds));
        formData.append('photo', effectivePhoto);
        formData.append('tt_event_id', resumeEventId);
        formData.append('tt_template_id', selectedDance.id);
        formData.append('tt_template_name', selectedDance.name);
        const ttclid2 = getTikTokClickId();
        const ttp2 = getTikTokTtp();
        if (ttclid2) formData.append('tt_ttclid', ttclid2);
        if (ttp2) formData.append('tt_ttp', ttp2);

        const token = getToken();
        const response = await fetch('/api/generate', {
          method: 'POST',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: formData,
        });

        const result = await response.json();
        if (!response.ok) {
          if (response.status === 401) {
            router.replace(buildLoginRedirect(getCurrentPathWithSearch()));
            return;
          }

          throw new Error(result.error || 'Failed to resume paid session');
        }

        trackEvent('generation_start', {
          templateId: selectedDance.id,
          taskId: result.task_id,
        });

        localStorage.removeItem(PENDING_TEMPLATE_KEY);
        localStorage.setItem(PENDING_SESSION_ID_KEY, sessionId);
        await clearPhotoDB();
        setPaidTemplateRecovered(false);
        router.replace(`/create/${result.task_id}`);
        return;
      }

      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
        },
        body: JSON.stringify({
          templateId: selectedDance.id,
          templateName: selectedDance.name,
          ttEventId: checkoutEventId,
          ttTtclid: getTikTokClickId() || undefined,
          ttTtp: getTikTokTtp() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          router.replace(buildLoginRedirect(getCurrentPathWithSearch()));
          return;
        }
        throw new Error(data.error || 'Failed to create checkout session');
      }

      if (!data.url) throw new Error('No checkout URL returned');

      window.location.href = data.url;
     } catch (error) {
       const message = error instanceof Error ? error.message : 'Failed to start payment. Please try again.';
       toast.error(message);
       setIsProcessing(false);
     }
  }

  // Show processing overlay if returning from Stripe
  if (isProcessing && sessionId) {
    return (
      <div className="min-h-screen bg-dark-gradient flex flex-col items-center justify-center text-white">
        <div className="w-10 h-10 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-[15px] font-medium">Creating your video...</p>
        <p className="text-[13px] text-white/40 mt-1">This will just take a moment</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-gradient text-white">
      {/* Full-screen hero video */}
      <div className="fixed inset-0">
        <video
          autoPlay
          muted
          loop
          playsInline
          suppressHydrationWarning
          src="https://assets.tool.elser.ai/community/ai-pet-dance/pets/1.mp4"
          className="w-full h-full object-cover"
        />
        {/* Gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-[50%] bg-gradient-to-t from-black via-black/80 to-transparent" />
      </div>

      {/* Content overlay */}
      <div className="relative z-10 min-h-screen flex flex-col justify-end px-6 pb-6">
        {/* Top badge */}
        <div className="absolute top-12 left-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full glass text-[11px] font-medium text-white/90">
              <svg aria-hidden="true" className="w-3 h-3 text-purple-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            AI-Powered
          </div>
        </div>

        {/* Bottom content */}
        <div>
          <h1 className="text-[28px] font-bold leading-[1.15] tracking-tight mb-2">
            Create Your Own<br />
            <span className="bg-gradient-to-r from-purple-400 to-violet-300 bg-clip-text text-transparent">
              Dance Video
            </span>
          </h1>
          <p className="text-[14px] text-white/50 mb-5 leading-relaxed">
            Upload a selfie. Pick a dance. Get your video.
          </p>

          {/* My Videos */}
          <MyVideos videos={myVideos} />

          <Button
            variant="glow"
            size="lg"
            className="w-full text-base font-semibold"
            onClick={() => setSheetOpen(true)}
          >
            Create Yours
          </Button>

          {/* Trust line */}
          <div className="flex items-center justify-center gap-4 mt-4 text-[11px] text-white/25">
            <span>5-10 min delivery</span>
            <span>&middot;</span>
            <span>No watermark</span>
            <span>&middot;</span>
            <span>Secure payment</span>
          </div>
        </div>
      </div>

      {/* Bottom Sheet: Select dance + Upload photo + Pay */}
      <BottomSheet isOpen={sheetOpen} onClose={() => setSheetOpen(false)}>
        {/* Dance selector */}
        <DanceSelector
          selected={selectedDance}
          onSelect={(t) => {
            setSelectedDance(t);
            trackEvent('view_content', { templateId: t.id, templateName: t.name, amount: 2.99 });
          }}
        />

        {/* Photo upload */}
        <div className="mb-5">
          <p className="text-[11px] uppercase tracking-wider text-white/40 font-medium mb-2.5 px-1">
            Upload your photo
          </p>
          {sessionId || paidTemplateRecovered ? (
            <p className="px-1 mb-2 text-[11px] text-emerald-300">
              Payment already confirmed. Update your photo and continue without paying again.
            </p>
          ) : null}
          <PhotoUploader
            onFileSelected={handleFileSelected}
            selectedFile={photoFile}
            hasSavedPhoto={hasSavedPhoto}
          />
          
        </div>

        {/* Pay */}
        <Button
          variant="glow"
          size="lg"
          className="w-full"
          disabled={(!photoFile && !hasSavedPhoto) || isProcessing}
          isLoading={isProcessing}
          onClick={handlePay}
        >
          {sessionId ? 'Continue Without Paying Again' : 'Create Video'}
        </Button>
        <div className="flex items-center justify-center gap-1.5 mt-2 text-[11px] text-white/25">
          <svg aria-hidden="true" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
          Secure payment via Stripe
        </div>
      </BottomSheet>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  );
}
