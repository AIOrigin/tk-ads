'use client';

import { useState, useCallback, useRef, useEffect, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { useCreateStore } from '@/lib/store/create-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { PhotoUploader } from '@/components/create/PhotoUploader';
import { PresetCharacterSelector } from '@/components/create/PresetCharacterSelector';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { getToken } from '@/lib/api/client';
import { getCredits, getTotalCredits } from '@/lib/api/user-api';
import { trackEvent, generateEventId, getTikTokClickId, getTikTokTtp } from '@/lib/analytics';
import templates from '@/data/templates.json';
import {
  DEFAULT_PRESET_CHARACTER_ID,
  createPresetCharacterFile,
  getPresetCharacterById,
  presetCharacters,
  type PresetCharacter,
} from '@/data/preset-characters';
import type { Template } from '@/types/template';
import type { CharacterSelectionSource, CreateInputMode } from '@/types/create';
import { isCreateInputMode } from '@/types/create';
import {
  buildLoginRedirect,
  getCurrentPathWithSearch,
  getSavedVideos,
  PENDING_CHARACTER_ID_KEY,
  PENDING_INPUT_MODE_KEY,
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
const defaultPresetCharacter = getPresetCharacterById(DEFAULT_PRESET_CHARACTER_ID) ?? presetCharacters[0];
const PAYMENT_EVENT_IDS_KEY = 'dance_payment_event_ids';

interface CheckoutSessionInfo {
  sessionId: string;
  paymentStatus: string;
  templateId: string | null;
  taskId: string | null;
  generationStatus: string | null;
  paid: boolean;
  characterId: string | null;
  inputMode: string | null;
}

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

function getStoredInputMode(): CreateInputMode | null {
  if (typeof window === 'undefined') return null;

  const value = localStorage.getItem(PENDING_INPUT_MODE_KEY);
  return isCreateInputMode(value) ? value : null;
}

function savePendingDraft(template: Template, characterId: string, inputMode: CreateInputMode): void {
  localStorage.setItem(PENDING_TEMPLATE_KEY, JSON.stringify(template));
  localStorage.setItem(PENDING_CHARACTER_ID_KEY, characterId);
  localStorage.setItem(PENDING_INPUT_MODE_KEY, inputMode);
}

function clearPendingDraft(): void {
  localStorage.removeItem(PENDING_TEMPLATE_KEY);
  localStorage.removeItem(PENDING_CHARACTER_ID_KEY);
  localStorage.removeItem(PENDING_INPUT_MODE_KEY);
}

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

function buildFunnelEventProps({
  templateId,
  templateName,
  characterId,
  inputMode,
  characterSelectionSource,
  extras = {},
}: {
  templateId: string;
  templateName: string;
  characterId: string;
  inputMode: CreateInputMode;
  characterSelectionSource: CharacterSelectionSource;
  extras?: Record<string, string | number | boolean>;
}) {
  return {
    templateId,
    templateName,
    characterId,
    inputMode,
    characterSelectionSource,
    ...extras,
  };
}

function shuffleTemplates(items: Template[]): Template[] {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }

  return shuffled;
}

function DanceSelector({
  templates,
  selected,
  onSelect,
}: {
  templates: Template[];
  selected: Template;
  onSelect: (t: Template) => void;
}) {
  return (
    <div className="mb-5 px-1">
      <div className="mb-2.5 flex items-center gap-2 px-1">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-500/20 text-[11px] font-bold text-purple-200">
          1
        </span>
        <p className="text-[11px] font-medium uppercase tracking-wider text-white/40">
          Choose a dance
        </p>
      </div>
      <div
        className="scrollbar-hide -mx-1 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-1 py-4"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {templates.map((t) => {
          const isActive = t.id === selected.id;
          return (
            <button
              type="button"
              key={t.id}
              onClick={() => onSelect(t)}
              className={`w-[88px] flex-shrink-0 snap-start transition-all duration-200 first:ml-0.5 last:mr-0.5 ${
                isActive ? 'opacity-100' : 'opacity-60'
              }`}
            >
              <div
                className={`relative aspect-[9/16] overflow-hidden rounded-xl transition-all duration-200 ${
                  isActive
                    ? 'scale-[1.02] ring-2 ring-inset ring-purple-500 shadow-[0_0_12px_rgba(168,85,247,0.4)]'
                    : ''
                }`}
              >
                <img
                  src={t.thumbnailUrl}
                  alt={t.name}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              </div>
              <p className={`mt-1.5 truncate text-center text-[11px] ${
                isActive ? 'font-medium text-white' : 'text-white/40'
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
            className="w-14 flex-shrink-0"
          >
            <div className="relative aspect-[9/16] overflow-hidden rounded-lg bg-white/[0.06] ring-1 ring-white/10">
              <video
                src={v.videoUrl}
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-white/25">
                  <svg aria-hidden="true" className="ml-0.5 h-2.5 w-2.5 text-white" fill="currentColor" viewBox="0 0 24 24">
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

function InputModeToggle({
  inputMode,
  onSelect,
}: {
  inputMode: CreateInputMode;
  onSelect: (mode: CreateInputMode) => void;
}) {
  return (
    <div className="mb-3 grid grid-cols-2 gap-1 rounded-2xl bg-white/[0.04] p-1">
      {(['preset', 'upload'] as CreateInputMode[]).map((mode) => {
        const isActive = inputMode === mode;
        const label = mode === 'preset' ? 'Character' : 'My Photo';

        return (
          <button
            key={mode}
            type="button"
            onClick={() => onSelect(mode)}
            className={`rounded-xl px-3 py-2.5 text-[12px] font-semibold transition-all duration-200 ${
              isActive
                ? 'bg-gradient-to-r from-violet-500 to-purple-500 text-white shadow-[0_0_20px_rgba(168,85,247,0.28)]'
                : 'text-white/45 hover:bg-white/[0.05] hover:text-white/80'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function SelectedCharacterSummary({
  character,
  actionLabel,
  onAction,
}: {
  character: PresetCharacter;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(168,85,247,0.18),_transparent_45%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] shadow-[0_18px_50px_rgba(0,0,0,0.3)]">
      <div className="relative aspect-[4/3] overflow-hidden">
        <img
          src={character.imageUrl}
          alt={`${character.name} blurred backdrop`}
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full scale-110 object-cover blur-3xl brightness-[0.38]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/65" />
        <div className="absolute inset-0 z-[1] flex items-start justify-center px-4 pb-1 pt-5">
          <img
            src={character.imageUrl}
            alt={character.name}
            loading="lazy"
            decoding="async"
            className="h-[96%] w-auto max-w-full rounded-[22px] object-contain drop-shadow-[0_20px_40px_rgba(0,0,0,0.45)]"
          />
        </div>
      </div>
      <div className="px-4 pb-3.5 pt-2.5">
        <p className="truncate text-[10px] font-medium uppercase tracking-[0.28em] text-white/28">
          {character.name}
        </p>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="mt-2.5 inline-flex items-center rounded-full bg-white/[0.06] px-4 py-2.5 text-[13px] font-semibold text-purple-200 transition-all hover:bg-white/[0.09] hover:text-white"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function LandingSkeleton() {
  return (
    <div className="min-h-screen bg-dark-gradient text-white">
      <div className="mx-auto max-w-lg px-5 pb-8 pt-6">
        <div className="mb-5 px-1">
          <div className="h-8 w-72 animate-pulse rounded-xl bg-white/[0.08]" />
        </div>

        <div className="mb-5 px-1">
          <div className="mb-2.5 h-5 w-36 animate-pulse rounded-full bg-white/[0.06]" />
          <div className="scrollbar-hide flex gap-2.5 overflow-x-auto py-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className="w-[88px] flex-shrink-0 animate-pulse"
              >
                <div className="aspect-[9/16] rounded-xl bg-white/[0.08]" />
                <div className="mt-1 h-3 rounded-full bg-white/[0.06]" />
              </div>
            ))}
          </div>
        </div>

        <div className="mb-5 px-1">
          <div className="mb-3 h-5 w-60 animate-pulse rounded-full bg-white/[0.06]" />
          <div className="overflow-hidden rounded-[28px] border border-white/8 bg-white/[0.04] p-4">
            <div className="aspect-[4/3] animate-pulse rounded-[24px] bg-white/[0.06]" />
          </div>
        </div>

        <div className="px-1">
          <div className="h-16 w-full animate-pulse rounded-[24px] bg-white/[0.08]" />
        </div>
      </div>
    </div>
  );
}

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const canceled = searchParams.get('canceled');
  const shouldResume = searchParams.get('resume') === '1';
  const requestedCharacter = searchParams.get('character') ?? searchParams.get('characterId');
  const urlCharacter = getPresetCharacterById(requestedCharacter) ?? null;
  const hasUrlCharacterVariant = !!urlCharacter;
  const trackedPaymentCancelRef = useRef(false);
  const landingHydratedRef = useRef(false);

  useEffect(() => {
    if (sessionId || canceled || shouldResume) return;
    const pendingTaskId = localStorage.getItem(PENDING_TASK_ID_KEY);
    if (pendingTaskId) {
      router.replace(`/create/${pendingTaskId}`);
    }
  }, [router, sessionId, canceled, shouldResume]);

  useAuth();
  const { selectTemplate } = useCreateStore();

  const [shuffledTemplates] = useState<Template[]>(() => shuffleTemplates(allTemplates));
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [selectedDance, setSelectedDance] = useState<Template>(shuffledTemplates[0] ?? allTemplates[0]);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>(urlCharacter?.id ?? defaultPresetCharacter.id);
  const [inputMode, setInputMode] = useState<CreateInputMode>('preset');
  const [characterSelectionSource, setCharacterSelectionSource] = useState<CharacterSelectionSource>(urlCharacter ? 'url' : 'default');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [hasSavedPhoto, setHasSavedPhoto] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paidTemplateRecovered, setPaidTemplateRecovered] = useState(false);
  const [myVideos, setMyVideos] = useState<SavedVideo[]>([]);
  const viewContentTrackedRef = useRef(false);

  const selectedCharacter = getPresetCharacterById(selectedCharacterId) ?? defaultPresetCharacter;
  const visibleCharacters = hasUrlCharacterVariant && urlCharacter ? [urlCharacter] : presetCharacters;
  const canCreate = inputMode === 'preset' || !!photoFile || hasSavedPhoto;

  const handleInputModeSelect = useCallback((mode: CreateInputMode) => {
    setInputMode(mode);
  }, []);

  const currentEventProps = useCallback((extras: Record<string, string | number | boolean> = {}) => (
    buildFunnelEventProps({
      templateId: selectedDance.id,
      templateName: selectedDance.name,
      characterId: selectedCharacter.id,
      inputMode,
      characterSelectionSource,
      extras,
    })
  ), [selectedDance.id, selectedDance.name, selectedCharacter.id, inputMode, characterSelectionSource]);

  const resolveTemplateById = useCallback((templateId: string | null | undefined) => {
    if (!templateId) return null;
    return allTemplates.find((template) => template.id === templateId) ?? null;
  }, []);

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

    return response.json() as Promise<CheckoutSessionInfo>;
  }, [router, sessionId]);

  const restorePendingDraft = useCallback(async () => {
    const pendingRaw = localStorage.getItem(PENDING_TEMPLATE_KEY);
    const pendingCharacterId = localStorage.getItem(PENDING_CHARACTER_ID_KEY);
    const pendingInputMode = getStoredInputMode();
    const preferUrlCharacter = !!urlCharacter && !canceled && !shouldResume;

    let restored = false;
    let restoredUploadPhoto = false;

    if (pendingRaw) {
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
          restored = true;
        }
      } catch {
        // Ignore invalid local draft payloads
      }
    }

    if (pendingCharacterId || pendingInputMode) {
      const matchedCharacter = preferUrlCharacter
        ? urlCharacter
        : (getPresetCharacterById(pendingCharacterId) ?? defaultPresetCharacter);
      setSelectedCharacterId(matchedCharacter.id);
      setCharacterSelectionSource(preferUrlCharacter ? 'url' : 'restore');
      setInputMode(pendingInputMode ?? 'preset');
      restored = true;
    }

    if (localStorage.getItem(PENDING_PHOTO_READY_KEY) === '1') {
      setHasSavedPhoto(true);
    }

    try {
      const savedPhoto = await loadPhotoFromDB();
      if (savedPhoto) {
        setPhotoFile(savedPhoto);
        setHasSavedPhoto(true);
        restoredUploadPhoto = true;
      } else {
        setHasSavedPhoto(false);
        localStorage.removeItem(PENDING_PHOTO_READY_KEY);
      }
    } catch {
      // Ignore IndexedDB load failures and let the user continue with a preset.
      setHasSavedPhoto(false);
      localStorage.removeItem(PENDING_PHOTO_READY_KEY);
    }

    if ((pendingInputMode ?? 'preset') === 'upload' && !restoredUploadPhoto) {
      setInputMode('preset');
    }

    return { restored, restoredUploadPhoto, pendingInputMode };
  }, [resolveTemplateById, urlCharacter, canceled, shouldResume]);

  const getUploadedPhoto = useCallback(async () => {
    if (photoFile) return photoFile;
    return loadPhotoFromDB();
  }, [photoFile]);

  const getGenerationPhoto = useCallback(async (mode: CreateInputMode, character: PresetCharacter) => {
    if (mode === 'upload') {
      return getUploadedPhoto();
    }

    return createPresetCharacterFile(character);
  }, [getUploadedPhoto]);

  useEffect(() => {
    if (landingHydratedRef.current || sessionId) return;
    landingHydratedRef.current = true;

    let isCancelled = false;

    void (async () => {
      const restoreResult = await restorePendingDraft();
      if (isCancelled) return;

      if (!restoreResult.restored) {
        const initialCharacter = urlCharacter ?? defaultPresetCharacter;
        setSelectedCharacterId(initialCharacter.id);
        setCharacterSelectionSource(urlCharacter ? 'url' : 'default');
        setInputMode('preset');
      } else if (
        (canceled || shouldResume) &&
        restoreResult.pendingInputMode === 'upload' &&
        !restoreResult.restoredUploadPhoto
      ) {
        toast.info('Your saved photo could not be restored. You can re-upload it or continue with the selected preset character.');
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [sessionId, canceled, shouldResume, restorePendingDraft, urlCharacter]);

  useEffect(() => {
    if (viewContentTrackedRef.current || sessionId || canceled || shouldResume) return;

    const timer = window.setTimeout(() => {
      if (viewContentTrackedRef.current) return;

      viewContentTrackedRef.current = true;
      trackEvent('view_content', currentEventProps({
        amount: 1.99,
        source: 'landing_visible',
      }));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [canceled, currentEventProps, sessionId, shouldResume]);

  const trackTemplateSelect = useCallback((template: Template, source: string) => {
    trackEvent('template_select', {
      templateId: template.id,
      templateName: template.name,
      source,
      characterId: selectedCharacter.id,
      inputMode,
      characterSelectionSource,
    });
  }, [selectedCharacter.id, inputMode, characterSelectionSource]);

  const handleTemplateSelect = useCallback((template: Template) => {
    if (template.id === selectedDance.id) return;
    setSelectedDance(template);
    trackTemplateSelect(template, 'manual');
  }, [selectedDance.id, trackTemplateSelect]);

  const handleCharacterSelect = useCallback((character: PresetCharacter) => {
    if (character.id === selectedCharacter.id && inputMode === 'preset') return;

    setSelectedCharacterId(character.id);
    setCharacterSelectionSource('manual');
    setInputMode('preset');

    trackEvent('character_select', buildFunnelEventProps({
      templateId: selectedDance.id,
      templateName: selectedDance.name,
      characterId: character.id,
      inputMode: 'preset',
      characterSelectionSource: 'manual',
    }));
  }, [selectedDance.id, selectedDance.name, selectedCharacter.id, inputMode]);

  useEffect(() => {
    setMyVideos(getSavedVideos());
  }, []);

  useEffect(() => {
    if (!canceled || trackedPaymentCancelRef.current) return;
    trackedPaymentCancelRef.current = true;

    const pendingRaw = localStorage.getItem(PENDING_TEMPLATE_KEY);
    let pendingTemplate: Template | null = null;
    try {
      pendingTemplate = pendingRaw ? JSON.parse(pendingRaw) as Template : null;
    } catch {
      pendingTemplate = null;
    }

    const pendingCharacter = getPresetCharacterById(localStorage.getItem(PENDING_CHARACTER_ID_KEY)) ?? selectedCharacter;
    const pendingInputMode = getStoredInputMode() ?? inputMode;
    const hasSavedDraft = !!pendingRaw || !!localStorage.getItem(PENDING_CHARACTER_ID_KEY);
    const hasSavedUpload = localStorage.getItem(PENDING_PHOTO_READY_KEY) === '1';

    trackEvent('payment_cancel', buildFunnelEventProps({
      templateId: pendingTemplate?.id || selectedDance.id,
      templateName: pendingTemplate?.name || selectedDance.name,
      characterId: pendingCharacter.id,
      inputMode: pendingInputMode,
      characterSelectionSource: 'restore',
    }));

    if (hasSavedDraft && hasSavedUpload) {
      toast.info('Payment was not completed. Your dance, character, and photo are still saved.');
      return;
    }

    if (hasSavedDraft) {
      toast.info('Payment was not completed. Your dance and preset character are still saved.');
      return;
    }

    toast.info('Payment was not completed. Please choose your dance, character, or photo again.');
  }, [canceled, inputMode, selectedDance.id, selectedDance.name, selectedCharacter]);

  useEffect(() => {
    if (!sessionId) return;

    const activeSessionId = sessionId;

    async function handlePaymentSuccess() {
      setIsProcessing(true);

      try {
        const savedRaw = localStorage.getItem(PENDING_TEMPLATE_KEY);
        const savedCharacterId = localStorage.getItem(PENDING_CHARACTER_ID_KEY);
        const savedInputMode = getStoredInputMode();

        let savedTemplate: Template | null = null;
        try {
          savedTemplate = savedRaw ? JSON.parse(savedRaw) as Template : null;
        } catch {
          savedTemplate = null;
        }

        const paidSessionInfo = await fetchPaidSessionInfo();
        if (!paidSessionInfo?.paid) {
          toast.error('Payment is not completed yet. Please finish checkout before continuing.');
          setIsProcessing(false);
          return;
        }

        const paidTemplate = savedTemplate ?? resolveTemplateById(paidSessionInfo.templateId);
        const recoveredCharacter = getPresetCharacterById(savedCharacterId)
          ?? getPresetCharacterById(paidSessionInfo.characterId)
          ?? urlCharacter
          ?? defaultPresetCharacter;
        const recoveredInputMode = savedInputMode
          ?? (isCreateInputMode(paidSessionInfo.inputMode) ? paidSessionInfo.inputMode : null)
          ?? 'preset';

        const existingPurchaseEventId = getPaymentEventId(activeSessionId);
        const purchaseEventId = existingPurchaseEventId || generateEventId();

        if (!existingPurchaseEventId) {
          trackEvent('payment_complete', buildFunnelEventProps({
            templateId: paidTemplate?.id || paidSessionInfo.templateId || '',
            templateName: paidTemplate?.name || '',
            characterId: recoveredCharacter.id,
            inputMode: recoveredInputMode,
            characterSelectionSource: 'restore',
            extras: {
              amount: 1.99,
              sessionId: activeSessionId,
              eventId: purchaseEventId,
            },
          }));
          savePaymentEventId(activeSessionId, purchaseEventId);
        }

        if (paidSessionInfo?.taskId) {
          localStorage.setItem(PENDING_SESSION_ID_KEY, activeSessionId);
          router.replace(`/create/${paidSessionInfo.taskId}`);
          return;
        }

        const template = paidTemplate;
        if (!template) {
          toast.error('We found your payment, but could not recover your draft. Please contact support before retrying payment.');
          setIsProcessing(false);
          return;
        }

        setSelectedDance(template);
        setSelectedCharacterId(recoveredCharacter.id);
        setCharacterSelectionSource('restore');
        setInputMode(recoveredInputMode);
        savePendingDraft(template, recoveredCharacter.id, recoveredInputMode);

        if (!savedTemplate) {
          setPaidTemplateRecovered(true);
          trackEvent('template_select', {
            templateId: template.id,
            templateName: template.name,
            source: 'resume_paid',
            characterId: recoveredCharacter.id,
            inputMode: recoveredInputMode,
            characterSelectionSource: 'restore',
          });
        }

        const photo = await getGenerationPhoto(recoveredInputMode, recoveredCharacter);
        if (!photo) {
          toast.error('Payment confirmed. Please re-upload your photo to finish your video without paying again.');
          setIsProcessing(false);
          setPhotoFile(null);
          setHasSavedPhoto(false);
          setInputMode('upload');
          return;
        }

        const formData = new FormData();
        formData.append('session_id', activeSessionId);
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

          toast.error(result.error || 'Payment confirmed, but generation failed. Fix your draft below and continue without paying again.');
          setIsProcessing(false);
          return;
        }

        trackEvent('generation_start', buildFunnelEventProps({
          templateId: template.id,
          templateName: template.name,
          characterId: recoveredCharacter.id,
          inputMode: recoveredInputMode,
          characterSelectionSource: 'restore',
          extras: {
            taskId: result.task_id,
          },
        }));

        clearPendingDraft();
        localStorage.setItem(PENDING_SESSION_ID_KEY, activeSessionId);
        await clearPhotoDB();

        router.replace(`/create/${result.task_id}`);
      } catch {
        toast.error('Something went wrong. Please try again.');
        setIsProcessing(false);
      }
    }

    void handlePaymentSuccess();
  }, [fetchPaidSessionInfo, getGenerationPhoto, resolveTemplateById, router, sessionId, urlCharacter]);

  const handleFileSelected = useCallback((file: File) => {
    setPhotoFile(file);
    setHasSavedPhoto(true);
    setInputMode('upload');
    trackEvent('photo_upload', buildFunnelEventProps({
      templateId: selectedDance.id,
      templateName: selectedDance.name,
      characterId: selectedCharacter.id,
      inputMode: 'upload',
      characterSelectionSource,
      extras: {
        sizeBytes: file.size,
        mime: file.type,
      },
    }));
  }, [selectedDance.id, selectedDance.name, selectedCharacter.id, characterSelectionSource]);

  async function handlePay() {
    if (!selectedDance) return;

    const uploadedPhoto = await getUploadedPhoto();
    const generationPhoto = await getGenerationPhoto(inputMode, selectedCharacter);

    if (inputMode === 'upload' && !generationPhoto) {
      toast.error('Please upload a photo to continue.');
      setPhotoFile(null);
      setHasSavedPhoto(false);
      localStorage.removeItem(PENDING_PHOTO_READY_KEY);
      return;
    }

    if (!generationPhoto) {
      toast.error('Unable to load the selected preset character. Please try another character.');
      return;
    }

    if (uploadedPhoto) {
      setPhotoFile(uploadedPhoto);
      setHasSavedPhoto(true);
    }

    if (!useAuthStore.getState().isAuthenticated) {
      selectTemplate(selectedDance);
      if (uploadedPhoto) {
        await savePhotoToDB(uploadedPhoto);
      }
      savePendingDraft(selectedDance, selectedCharacter.id, inputMode);

      setShowAuthModal(true);
      return;
    }

    setIsProcessing(true);

    try {
      if (uploadedPhoto) {
        await savePhotoToDB(uploadedPhoto);
      }
      savePendingDraft(selectedDance, selectedCharacter.id, inputMode);

      const creditsNeeded = Math.ceil((selectedDance.mode === '720p' ? 17 : 26) * selectedDance.durationSeconds * 1.8);
      let hasEnoughCredits = false;
      try {
        const credits = await getCredits();
        const total = getTotalCredits(credits);
        hasEnoughCredits = total >= creditsNeeded;
      } catch {
        // Ignore credit lookup issues and fall through to payment.
      }

      if (hasEnoughCredits) {
        const formData = new FormData();
        formData.append('motion_video_url', selectedDance.motionVideoUrl);
        formData.append('mode', selectedDance.mode);
        formData.append('character_orientation', selectedDance.characterOrientation);
        formData.append('duration_seconds', String(selectedDance.durationSeconds));
        formData.append('photo', generationPhoto);

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
          trackEvent('generation_start', currentEventProps({
            taskId: result.task_id,
          }));

          clearPendingDraft();
          localStorage.setItem(PENDING_SESSION_ID_KEY, 'credits');
          await clearPhotoDB();
          router.replace(`/create/${result.task_id}`);
          return;
        }

        if (response.status !== 402) {
          throw new Error(result.error || 'Generation failed');
        }
      }

      const checkoutEventId = generateEventId();
      trackEvent('payment_start', currentEventProps({
        amount: 1.99,
        eventId: checkoutEventId,
      }));

      if (sessionId) {
        const resumeEventId = getPaymentEventId(sessionId) || generateEventId();
        const formData = new FormData();
        formData.append('session_id', sessionId);
        formData.append('motion_video_url', selectedDance.motionVideoUrl);
        formData.append('mode', selectedDance.mode);
        formData.append('character_orientation', selectedDance.characterOrientation);
        formData.append('duration_seconds', String(selectedDance.durationSeconds));
        formData.append('photo', generationPhoto);
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

        trackEvent('generation_start', currentEventProps({
          taskId: result.task_id,
        }));

        clearPendingDraft();
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
          characterId: selectedCharacter.id,
          inputMode,
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

      if (!data.url) {
        throw new Error('No checkout URL returned');
      }

      window.location.href = data.url;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start payment. Please try again.';
      toast.error(message);
      setIsProcessing(false);
    }
  }

  const primaryCtaLabel = sessionId ? 'Finish My Video' : 'Create My Video';

  if (isProcessing && sessionId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-dark-gradient text-white">
        <div className="mb-4 h-10 w-10 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
        <p className="text-[15px] font-medium">Creating your video...</p>
        <p className="mt-1 text-[13px] text-white/40">This will just take a moment</p>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-dark-gradient text-white">
        <div className="mx-auto max-w-lg px-5 pb-8 pt-6">
          <div className="mb-5 px-1">
            <h1 className="text-[22px] font-bold leading-[1.15] tracking-tight">
              Create Your Own{' '}
              <span className="bg-gradient-to-r from-purple-400 to-violet-300 bg-clip-text text-transparent">
                Dance Video
              </span>
            </h1>
          </div>

          <MyVideos videos={myVideos} />

          <DanceSelector
            templates={shuffledTemplates}
            selected={selectedDance}
            onSelect={handleTemplateSelect}
          />

          <div className="mb-5 px-1">
            <div className="mb-3 flex items-center gap-2 px-1">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-500/20 text-[11px] font-bold text-purple-200">
                2
              </span>
              <p className="text-[11px] font-medium uppercase tracking-wider text-white/40">
                Choose a character or upload your photo
              </p>
            </div>

            {sessionId || paidTemplateRecovered ? (
              <p className="mb-2 px-1 text-[11px] text-emerald-300">
                Payment already confirmed. Update your character or photo and continue without paying again.
              </p>
            ) : null}

            {hasUrlCharacterVariant ? (
              inputMode === 'preset' ? (
                <SelectedCharacterSummary
                  character={selectedCharacter}
                  actionLabel="Change another photo"
                  onAction={() => handleInputModeSelect('upload')}
                />
              ) : (
                <div>
                  <div className="rounded-2xl ring-2 ring-purple-500/40 transition-all">
                    <PhotoUploader
                      onFileSelected={handleFileSelected}
                      selectedFile={photoFile}
                      hasSavedPhoto={hasSavedPhoto}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleInputModeSelect('preset')}
                    className="mt-3 text-[12px] font-semibold text-purple-300 transition-colors hover:text-purple-200"
                  >
                    Use {selectedCharacter.name}
                  </button>
                </div>
              )
            ) : (
              <>
                <InputModeToggle
                  inputMode={inputMode}
                  onSelect={handleInputModeSelect}
                />

                {inputMode === 'preset' ? (
                  <PresetCharacterSelector
                    characters={visibleCharacters}
                    selectedId={selectedCharacter.id}
                    activeInputMode={inputMode}
                    onSelect={handleCharacterSelect}
                  />
                ) : (
                  <div className="rounded-2xl ring-2 ring-purple-500/40 transition-all">
                    <PhotoUploader
                      onFileSelected={handleFileSelected}
                      selectedFile={photoFile}
                      hasSavedPhoto={hasSavedPhoto}
                    />
                  </div>
                )}
              </>
            )}

            {hasSavedPhoto && inputMode === 'preset' ? (
              <p className="mt-2 px-1 text-[11px] text-white/30">
                Your uploaded photo is still saved if you want to switch back.
              </p>
            ) : null}
          </div>

          <div className="px-1">
            <Button
              variant="glow"
              size="lg"
              className="landing-cta h-16 w-full rounded-[24px] text-[18px] font-bold tracking-[-0.02em] shadow-[0_0_34px_rgba(168,85,247,0.52)] transition-transform duration-200 hover:scale-[1.01] hover:shadow-[0_0_42px_rgba(192,132,252,0.68)] active:scale-[0.985] active:shadow-[0_0_22px_rgba(168,85,247,0.34)]"
              disabled={!canCreate || isProcessing}
              isLoading={isProcessing}
              onClick={handlePay}
            >
              <span className="relative z-[1] inline-flex items-center gap-2.5">
                <span className="landing-cta-icon flex h-7 w-7 items-center justify-center rounded-full bg-white/14 ring-1 ring-white/10">
                  <svg aria-hidden="true" className="ml-0.5 h-3.5 w-3.5 fill-current text-white" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
                <span>{primaryCtaLabel}</span>
              </span>
            </Button>
          </div>
        </div>
      </div>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={() => {
          setShowAuthModal(false);
          setTimeout(() => handlePay(), 300);
        }}
      />
    </>
  );
}

function HomePageClient() {
  return (
    <Suspense fallback={<LandingSkeleton />}>
      <HomeContent />
    </Suspense>
  );
}

const ClientOnlyHomePage = dynamic(async () => HomePageClient, {
  ssr: false,
  loading: () => <LandingSkeleton />,
});

export default function HomePage() {
  return <ClientOnlyHomePage />;
}
