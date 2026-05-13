const DEFAULT_REDIRECT = '/';
const POST_AUTH_REDIRECT_KEY = 'dance_post_auth_redirect';

export const PENDING_TEMPLATE_KEY = 'dance_pending_template';
export const PENDING_PHOTO_READY_KEY = 'dance_pending_photo_saved';
export const PENDING_SESSION_ID_KEY = 'dance_pending_session_id';
export const PENDING_TASK_ID_KEY = 'dance_pending_task_id';
export const PENDING_CHARACTER_ID_KEY = 'dance_pending_character_id';
export const PENDING_INPUT_MODE_KEY = 'dance_pending_input_mode';
export const ACTIVE_ORDER_KEY = 'dance_active_order';

// --- My Videos (localStorage) ---
const MY_VIDEOS_KEY = 'dance_my_videos';
const MAX_SAVED_VIDEOS = 20;

export interface SavedVideo {
  taskId: string;
  videoUrl: string;
  createdAt: string;
}

export interface ActiveOrder {
  orderId: string;
  token: string;
  taskId: string | null;
  email: string | null;
  updatedAt: string;
}

export function getSavedVideos(): SavedVideo[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(MY_VIDEOS_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveVideo(video: SavedVideo): void {
  const videos = getSavedVideos();
  // Deduplicate by taskId
  const filtered = videos.filter((v) => v.taskId !== video.taskId);
  filtered.unshift(video);
  localStorage.setItem(MY_VIDEOS_KEY, JSON.stringify(filtered.slice(0, MAX_SAVED_VIDEOS)));
}

function isActiveOrder(value: unknown): value is ActiveOrder {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Partial<ActiveOrder>;
  return (
    typeof candidate.orderId === 'string' &&
    candidate.orderId.length > 0 &&
    typeof candidate.token === 'string' &&
    candidate.token.length > 0
  );
}

export function getActiveOrder(): ActiveOrder | null {
  if (typeof window === 'undefined') return null;

  try {
    const parsed = JSON.parse(localStorage.getItem(ACTIVE_ORDER_KEY) || 'null');
    return isActiveOrder(parsed)
      ? {
          orderId: parsed.orderId,
          token: parsed.token,
          taskId: parsed.taskId ?? null,
          email: parsed.email ?? null,
          updatedAt: parsed.updatedAt || new Date().toISOString(),
        }
      : null;
  } catch {
    return null;
  }
}

export function saveActiveOrder(order: Omit<ActiveOrder, 'updatedAt'> & { updatedAt?: string }): void {
  if (typeof window === 'undefined') return;

  localStorage.setItem(ACTIVE_ORDER_KEY, JSON.stringify({
    orderId: order.orderId,
    token: order.token,
    taskId: order.taskId ?? null,
    email: order.email ?? null,
    updatedAt: order.updatedAt || new Date().toISOString(),
  }));
}

export function clearActiveOrder(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ACTIVE_ORDER_KEY);
}

export function clearActiveOrderIfMatches(orderId: string | null | undefined): void {
  if (typeof window === 'undefined') return;

  const activeOrder = getActiveOrder();
  if (!activeOrder || (orderId && activeOrder.orderId !== orderId)) return;
  clearActiveOrder();
}

export const PHOTO_DB_NAME = 'dance_photo_db';
export const PHOTO_STORE = 'photos';
export const PHOTO_KEY = 'pending_photo';

export function sanitizeRedirect(target: string | null | undefined): string {
  if (!target || !target.startsWith('/') || target.startsWith('//')) {
    return DEFAULT_REDIRECT;
  }

  return target;
}

export function buildLoginRedirect(redirect: string | null | undefined, email?: string | null): string {
  const params = new URLSearchParams({
    redirect: sanitizeRedirect(redirect),
  });

  if (email?.trim()) {
    params.set('email', email.trim());
  }

  return `/login?${params.toString()}`;
}

export function getAuthBackTarget(redirect: string | null | undefined): string {
  const safeRedirect = sanitizeRedirect(redirect);

  if (
    safeRedirect.startsWith('/login') ||
    safeRedirect.startsWith('/auth/') ||
    safeRedirect.startsWith('/create/')
  ) {
    return DEFAULT_REDIRECT;
  }

  return safeRedirect;
}

export function savePostAuthRedirect(redirect: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(POST_AUTH_REDIRECT_KEY, sanitizeRedirect(redirect));
}

export function getSavedPostAuthRedirect(): string {
  if (typeof window === 'undefined') return DEFAULT_REDIRECT;
  return sanitizeRedirect(localStorage.getItem(POST_AUTH_REDIRECT_KEY));
}

export function consumePostAuthRedirect(fallback?: string | null): string {
  if (typeof window === 'undefined') return sanitizeRedirect(fallback);

  const saved = localStorage.getItem(POST_AUTH_REDIRECT_KEY);
  localStorage.removeItem(POST_AUTH_REDIRECT_KEY);

  return sanitizeRedirect(saved ?? fallback);
}

export function getCurrentPathWithSearch(): string {
  if (typeof window === 'undefined') return DEFAULT_REDIRECT;
  return sanitizeRedirect(`${window.location.pathname}${window.location.search}`);
}
