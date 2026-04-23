'use client';

import { useState, useCallback, useRef, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { useCreateStore } from '@/lib/store/create-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { PhotoUploader } from '@/components/create/PhotoUploader';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { getToken } from '@/lib/api/client';
import { getCredits, getTotalCredits } from '@/lib/api/user-api';
import { trackEvent, generateEventId, getTikTokClickId, getTikTokTtp } from '@/lib/analytics';
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
import { AuthModal } from '@/components/auth/AuthModal';

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

const PAYMENT_EVENT_IDS_KEY = 'dance_payment_event_ids';

function getPaymentEventIds(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(PAYMENT_EVENT_IDS_KEY) || '{}');
  } catch {
    return {};
  }
}

function getPaymentEventId(sessionId: string): string | null {
  return getPaymentEventIds()[sessionId] ?? null;
}

function savePaymentEventId(sessionId: string, eventId: string): void {
  const eventIds = getPaymentEventIds();
  eventIds[sessionId] = eventId;
  localStorage.setItem(PAYMENT_EVENT_IDS_KEY, JSON.stringify(eventIds));
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
        className="flex gap-2.5 overflow-x-auto py-3 -my-3 px-3 -mx-3 scrollbar-hide snap-x snap-mandatory"
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
                    ? 'ring-2 ring-inset ring-purple-500 shadow-[0_0_12px_rgba(168,85,247,0.4)]'
                    : ''
                }`}
              >
                <img
                  src={t.thumbnailUrl}
                  alt={t.name}
                  loading="lazy"
                  decoding="async"
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

// --- Main Page ---
function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const canceled = searchParams.get('canceled');
  const shouldResume = searchParams.get('resume') === '1';
  const trackedPaymentCancelRef = useRef(false);

  // If there's a pending task, resume to its progress page
  useEffect(() => {
    if (sessionId || canceled || shouldResume) return; // don't redirect if explicitly coming back
    const pendingTaskId = localStorage.getItem(PENDING_TASK_ID_KEY);
    if (pendingTaskId) {
      router.replace(`/create/${pendingTaskId}`);
    }
  }, [router, sessionId, canceled, shouldResume]);

  useAuth();
  const { selectTemplate } = useCreateStore();

  const [showAuthModal, setShowAuthModal] = useState(false);
  
  const [selectedDance, setSelectedDance] = useState<Template>(allTemplates[0]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [hasSavedPhoto, setHasSavedPhoto] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paidTemplateRecovered, setPaidTemplateRecovered] = useState(false);
  const [myVideos, setMyVideos] = useState<SavedVideo[]>([]);
  const viewContentTrackedRef = useRef(false);

  useEffect(() => {
    if (viewContentTrackedRef.current || sessionId || canceled || shouldResume) return;

    const timer = window.setTimeout(() => {
      if (viewContentTrackedRef.current) return;

      viewContentTrackedRef.current = true;
      trackEvent('view_content', {
        templateId: selectedDance.id,
        templateName: selectedDance.name,
        amount: 1.99,
        source: 'landing_visible',
      });
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [canceled, selectedDance.id, selectedDance.name, sessionId, shouldResume]);

  const trackTemplateSelect = useCallback((template: Template, source: string) => {
    trackEvent('template_select', {
      templateId: template.id,
      templateName: template.name,
      source,
    });
  }, []);

  const handleTemplateSelect = useCallback((template: Template) => {
    if (template.id === selectedDance.id) return;
    setSelectedDance(template);
    trackTemplateSelect(template, 'manual');
  }, [selectedDance.id, trackTemplateSelect]);

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
        trackEvent('template_select', {
          templateId: matchedTemplate.id,
          templateName: matchedTemplate.name,
          source: 'restore',
        });
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
      if (!trackedPaymentCancelRef.current) {
        trackedPaymentCancelRef.current = true;
        const pendingRaw = localStorage.getItem(PENDING_TEMPLATE_KEY);
        let pendingTemplate: Template | null = null;
        try {
          pendingTemplate = pendingRaw ? JSON.parse(pendingRaw) as Template : null;
        } catch { /* ignore */ }

        trackEvent('payment_cancel', {
          templateId: pendingTemplate?.id || selectedDance.id,
          templateName: pendingTemplate?.name || selectedDance.name,
        });
      }

      void restorePendingState().then((restored) => {
        toast.info(
          restored
            ? 'Payment was not completed. Your dance and photo are still saved.'
            : 'Payment was not completed. Please choose your dance and upload a photo again.'
        );
      });
    }
  }, [canceled, restorePendingState, selectedDance.id, selectedDance.name]);

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

        const paidSessionInfo = await fetchPaidSessionInfo();
        if (!paidSessionInfo?.paid) {
          toast.error('Payment is not completed yet. Please finish checkout before continuing.');
          setIsProcessing(false);
          return;
        }

        const paidTemplate = savedTemplate ?? resolveTemplateById(paidSessionInfo.templateId);
        const existingPurchaseEventId = getPaymentEventId(sessionId!);
        const purchaseEventId = existingPurchaseEventId || generateEventId();
        if (!existingPurchaseEventId) {
          trackEvent('payment_complete', {
            amount: 1.99,
            sessionId: sessionId!,
            templateId: paidTemplate?.id || paidSessionInfo.templateId || '',
            templateName: paidTemplate?.name || '',
            eventId: purchaseEventId,
          });
          savePaymentEventId(sessionId!, purchaseEventId);
        }

        if (paidSessionInfo?.taskId) {
          localStorage.setItem(PENDING_SESSION_ID_KEY, sessionId!);
          router.replace(`/create/${paidSessionInfo.taskId}`);
          return;
        }

        const storedTemplate = savedTemplate;
        const template = storedTemplate ?? paidTemplate;

        if (!template) {
          toast.error('We found your payment, but could not recover your draft. Please contact support before retrying payment.');
          setIsProcessing(false);
          return;
        }

        if (!storedTemplate) {
          setSelectedDance(template);
          localStorage.setItem(PENDING_TEMPLATE_KEY, JSON.stringify(template));
          setPaidTemplateRecovered(true);
          trackEvent('template_select', {
            templateId: template.id,
            templateName: template.name,
            source: 'resume_paid',
          });
        }

        const photo = await loadPhotoFromDB();
        if (!photo) {
          toast.error('Payment confirmed. Please re-upload your photo to finish your video without paying again.');
          setIsProcessing(false);
          setHasSavedPhoto(false);
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
      }
    }

    handlePaymentSuccess();
  }, [fetchPaidSessionInfo, resolveTemplateById, router, sessionId]);

  const handleFileSelected = useCallback((file: File) => {
    setPhotoFile(file);
    setHasSavedPhoto(true);
    trackEvent('photo_upload', {
      templateId: selectedDance.id,
      templateName: selectedDance.name,
      sizeBytes: file.size,
      mime: file.type,
    });
  }, [selectedDance.id, selectedDance.name]);

  async function handlePay() {
    if (!selectedDance) return;

    const effectivePhoto = photoFile ?? (await loadPhotoFromDB());
    if (!effectivePhoto) return;

    if (!photoFile) {
      setPhotoFile(effectivePhoto);
      setHasSavedPhoto(true);
    }

    // If not logged in, show auth modal instead of redirecting
    if (!useAuthStore.getState().isAuthenticated) {
      // Save state so we can resume after login
      selectTemplate(selectedDance);
      await savePhotoToDB(effectivePhoto);
      localStorage.setItem(PENDING_TEMPLATE_KEY, JSON.stringify(selectedDance));
      
      setShowAuthModal(true);
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
        const resumeEventId = getPaymentEventId(sessionId) || generateEventId();
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
    <>
      <div className="min-h-screen bg-dark-gradient text-white">
        <div className="px-5 pt-6 pb-8 max-w-lg mx-auto">
          <h1 className="text-[22px] font-bold leading-[1.15] tracking-tight mb-5">
            Create Your Own{' '}
            <span className="bg-gradient-to-r from-purple-400 to-violet-300 bg-clip-text text-transparent">
              Dance Video
            </span>
          </h1>

          <MyVideos videos={myVideos} />

          <DanceSelector
            selected={selectedDance}
            onSelect={handleTemplateSelect}
          />

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
        </div>
      </div>

      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)}
        onSuccess={() => {
          setShowAuthModal(false);
          // When login finishes successfully, trigger handlePay automatically
          // to continue the generation process seamlessly.
          setTimeout(() => handlePay(), 300);
        }}
      />
    </>
  );
}

export default function HomePage() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  );
}
