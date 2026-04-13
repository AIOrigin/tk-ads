const DEFAULT_REDIRECT = '/';
const POST_AUTH_REDIRECT_KEY = 'dance_post_auth_redirect';

export const PENDING_TEMPLATE_KEY = 'dance_pending_template';
export const PENDING_PHOTO_READY_KEY = 'dance_pending_photo_saved';
export const PENDING_SESSION_ID_KEY = 'dance_pending_session_id';
export const PENDING_TASK_ID_KEY = 'dance_pending_task_id';

// --- My Videos (localStorage) ---
const MY_VIDEOS_KEY = 'dance_my_videos';
const MAX_SAVED_VIDEOS = 20;

export interface SavedVideo {
  taskId: string;
  videoUrl: string;
  createdAt: string;
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
export const PHOTO_DB_NAME = 'dance_photo_db';
export const PHOTO_STORE = 'photos';
export const PHOTO_KEY = 'pending_photo';

export function sanitizeRedirect(target: string | null | undefined): string {
  if (!target || !target.startsWith('/') || target.startsWith('//')) {
    return DEFAULT_REDIRECT;
  }

  return target;
}

export function buildLoginRedirect(redirect: string | null | undefined): string {
  return `/login?redirect=${encodeURIComponent(sanitizeRedirect(redirect))}`;
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
