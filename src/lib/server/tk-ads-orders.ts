const USER_API_BASE = process.env.USER_API_INTERNAL_URL || process.env.NEXT_PUBLIC_USER_API_BASE_URL!;
const USER_API_KEY = process.env.USER_API_INTERNAL_KEY || '';
const TOOL_API_BASE = process.env.TOOL_API_INTERNAL_URL || process.env.NEXT_PUBLIC_TOOL_API_BASE_URL!;

export interface TkAdsOrder {
  orderId: string;
  token: string;
  userId: string;
  email: string;
  status: string;
  taskId: string | null;
  templateId: string;
  templateName: string | null;
  characterId: string | null;
  inputMode: string | null;
  unlocked: boolean;
  previewEmailSentAt: string | null;
  unlockEmailSentAt: string | null;
  accessToken: string;
}

export interface ToolVideo {
  video_url?: string | null;
  videoUrl?: string | null;
  watermark_url?: string | null;
  watermarkUrl?: string | null;
  duration_seconds?: number | null;
  durationSeconds?: number | null;
}

export interface ToolTaskStatus {
  task_id?: string;
  taskId?: string;
  status?: string;
  progress?: number;
  template_id?: string | null;
  templateId?: string | null;
  videos?: ToolVideo[];
}

export class UpstreamApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'UpstreamApiError';
  }
}

function internalHeaders(extra?: HeadersInit): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-API-Key': USER_API_KEY,
    ...extra,
  };
}

async function readJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'message' in payload
        ? String((payload as { message?: unknown }).message)
        : fallbackMessage;
    throw new UpstreamApiError(message, response.status);
  }
  return payload as T;
}

export function calculateMotionControlCredits(mode: string, durationSeconds: number): number {
  const base = (mode === '720p' ? 17 : 26) * durationSeconds;
  return Math.ceil(base * 1.8);
}

export async function createGuestOrder(params: {
  email: string;
  templateId: string;
  templateName: string;
  characterId: string;
  inputMode: string;
  creditsNeeded: number;
  appUrl: string;
  ip: string;
  userAgent: string;
  extra?: Record<string, unknown>;
}): Promise<{ orderId: string; token: string; userId: string; accessToken: string }> {
  const response = await fetch(`${USER_API_BASE}/v1/tk-ads/orders`, {
    method: 'POST',
    headers: internalHeaders(),
    body: JSON.stringify(params),
    cache: 'no-store',
  });
  return readJson(response, 'Failed to create guest order');
}

export async function getGuestOrder(orderId: string, token: string): Promise<TkAdsOrder> {
  const response = await fetch(
    `${USER_API_BASE}/v1/tk-ads/orders/${encodeURIComponent(orderId)}?token=${encodeURIComponent(token)}`,
    {
      headers: internalHeaders(),
      cache: 'no-store',
    }
  );
  return readJson(response, 'Failed to load order');
}

export async function attachGuestOrderTask(orderId: string, token: string, taskId: string): Promise<TkAdsOrder> {
  const response = await fetch(`${USER_API_BASE}/v1/tk-ads/orders/${encodeURIComponent(orderId)}/task`, {
    method: 'POST',
    headers: internalHeaders(),
    body: JSON.stringify({ token, taskId }),
    cache: 'no-store',
  });
  return readJson(response, 'Failed to attach order task');
}

export async function completeGuestOrder(orderId: string, token: string): Promise<TkAdsOrder> {
  const response = await fetch(`${USER_API_BASE}/v1/tk-ads/orders/${encodeURIComponent(orderId)}/complete`, {
    method: 'POST',
    headers: internalHeaders(),
    body: JSON.stringify({ token }),
    cache: 'no-store',
  });
  return readJson(response, 'Failed to complete order');
}

export async function failGuestOrder(orderId: string, token: string, error?: string): Promise<TkAdsOrder> {
  const response = await fetch(`${USER_API_BASE}/v1/tk-ads/orders/${encodeURIComponent(orderId)}/fail`, {
    method: 'POST',
    headers: internalHeaders(),
    body: JSON.stringify({ token, error }),
    cache: 'no-store',
  });
  return readJson(response, 'Failed to fail order');
}

export async function createUnlockCheckout(params: {
  orderId: string;
  token: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ redirectUrl: string }> {
  const response = await fetch(`${USER_API_BASE}/v1/tk-ads/orders/${encodeURIComponent(params.orderId)}/checkout`, {
    method: 'POST',
    headers: internalHeaders(),
    body: JSON.stringify({
      token: params.token,
      successUrl: params.successUrl,
      cancelUrl: params.cancelUrl,
    }),
    cache: 'no-store',
  });
  return readJson(response, 'Failed to start checkout');
}

export async function fetchToolTaskStatus(taskId: string, accessToken: string): Promise<ToolTaskStatus | null> {
  const response = await fetch(`${TOOL_API_BASE}/v2/video/status/batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ task_ids: [taskId] }),
    cache: 'no-store',
  });

  const payload = await readJson<{ results?: ToolTaskStatus[] }>(response, 'Failed to load task status');
  return payload.results?.[0] ?? null;
}

export function normalizeTaskState(status?: string): 'pending' | 'processing' | 'completed' | 'failed' {
  const normalized = (status || '').toLowerCase();
  if (normalized === 'completed' || normalized === 'succeeded') return 'completed';
  if (['failed', 'deleted', 'cancelled', 'canceled'].includes(normalized)) return 'failed';
  if (['processing', 'queued', 'submitted'].includes(normalized)) return 'processing';
  return 'pending';
}

export function resolveVideoUrls(task: ToolTaskStatus | null): {
  previewVideoUrl: string | null;
  originalVideoUrl: string | null;
} {
  const video = task?.videos?.[0];
  const originalVideoUrl = video?.video_url || video?.videoUrl || null;
  const previewVideoUrl = video?.watermark_url || video?.watermarkUrl || null;
  return { previewVideoUrl, originalVideoUrl };
}
