'use client';

import { useState, useCallback, useRef, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { useCreateStore } from '@/lib/store/create-store';
import { PhotoUploader } from '@/components/create/PhotoUploader';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { getToken } from '@/lib/api/client';
import { trackEvent } from '@/lib/analytics';
import { PRICE_DISPLAY } from '@/lib/constants';
import templates from '@/data/templates.json';
import type { Template } from '@/types/template';
import {
  buildLoginRedirect,
  getCurrentPathWithSearch,
  PENDING_PHOTO_READY_KEY,
  PENDING_TEMPLATE_KEY,
  PHOTO_DB_NAME,
  PHOTO_KEY,
  PHOTO_STORE,
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
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragY = useRef(0);
  const startY = useRef(0);
  const isDragging = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const el = sheetRef.current;
    if (!el) return;
    // Only allow drag if scrolled to top
    if (el.scrollTop > 0) return;
    startY.current = e.touches[0].clientY;
    isDragging.current = true;
    dragY.current = 0;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta < 0) {
      dragY.current = 0;
      return;
    }
    dragY.current = delta;
    if (sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${delta}px)`;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    if (sheetRef.current) {
      sheetRef.current.style.transform = '';
    }
    if (dragY.current > 100) {
      onClose();
    }
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close sheet"
        className={`fixed inset-0 bg-black/60 z-40 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />
      {/* Sheet */}
      <div
        className={`fixed inset-x-0 bottom-0 z-50 transition-transform duration-300 ease-out ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div
          ref={sheetRef}
          className="bg-[#1a1a1a] rounded-t-3xl max-h-[85vh] overflow-y-auto"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-white/20" />
          </div>
          <div className="px-5 pb-8 pt-2">{children}</div>
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

  const { isAuthenticated } = useAuth();
  const { selectTemplate } = useCreateStore();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedDance, setSelectedDance] = useState<Template>(allTemplates[0]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [hasSavedPhoto, setHasSavedPhoto] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paidTemplateRecovered, setPaidTemplateRecovered] = useState(false);

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
        trackEvent('payment_complete', { amount: 2.99, sessionId: sessionId! });

        const paidSessionInfo = await fetchPaidSessionInfo();
        if (paidSessionInfo?.taskId) {
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
    trackEvent('payment_start', {
      templateId: selectedDance.id,
      amount: 2.99,
    });

    try {
      await savePhotoToDB(effectivePhoto);
      localStorage.setItem(PENDING_TEMPLATE_KEY, JSON.stringify(selectedDance));

      if (sessionId) {
        const formData = new FormData();
        formData.append('session_id', sessionId);
        formData.append('motion_video_url', selectedDance.motionVideoUrl);
        formData.append('mode', selectedDance.mode);
        formData.append('character_orientation', selectedDance.characterOrientation);
        formData.append('duration_seconds', String(selectedDance.durationSeconds));
        formData.append('photo', effectivePhoto);

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
        body: JSON.stringify({ templateId: selectedDance.id }),
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
            Upload a selfie. Pick a dance. Only {PRICE_DISPLAY}.
          </p>

          <Button
            variant="glow"
            size="lg"
            className="w-full text-base font-semibold"
            onClick={() => setSheetOpen(true)}
          >
            Create Yours — {PRICE_DISPLAY}
          </Button>

          {/* Trust line */}
          <div className="flex items-center justify-center gap-4 mt-4 text-[11px] text-white/25">
            <span>1 min delivery</span>
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
          onSelect={setSelectedDance}
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
          {sessionId ? 'Continue Without Paying Again' : `Pay ${PRICE_DISPLAY} & Create Video`}
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
