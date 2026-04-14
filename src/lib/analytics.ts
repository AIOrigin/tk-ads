type EventProperties = Record<string, string | number | boolean>;

// TikTok standard event names matching the funnel configured in TikTok Ads Manager
const TT_EVENT_MAP: Record<string, string> = {
  view_content: 'ViewContent',
  sign_up: 'CompleteRegistration',
  payment_start: 'InitiateCheckout',
  payment_complete: 'Purchase',
  video_download: 'Download',
};

// Events that need server-side firing via /api/tt-event.
// InitiateCheckout and Purchase are excluded — they fire inline
// from /api/checkout and /api/generate respectively.
const SERVER_SIDE_EVENTS = new Set(['view_content', 'sign_up', 'video_download']);

// TikTok expects a nested `contents` array — flat params are silently ignored.
interface TikTokContent {
  content_id: string;
  content_type?: string;
  content_name?: string;
}

interface TikTokEventParams {
  contents?: TikTokContent[];
  value?: number;
  currency?: string;
  event_id?: string;
}

function toTikTokParams(props?: EventProperties): TikTokEventParams | undefined {
  if (!props) return { currency: 'USD', value: 0 };

  const params: TikTokEventParams = {};

  // content_id: prefer templateId, fall back to taskId
  const contentId = props.templateId || props.taskId;
  if (contentId) {
    const content: TikTokContent = {
      content_id: String(contentId),
      content_type: 'product',
    };
    if (props.templateName) content.content_name = String(props.templateName);
    params.contents = [content];
  }

  // TikTok flags missing value/currency as high severity on ALL events.
  // Always send them — use 0 for non-monetary events (CompleteRegistration).
  params.value = props.amount !== undefined ? Number(props.amount) : 0;
  params.currency = 'USD';

  if (props.eventId) {
    params.event_id = String(props.eventId);
  }

  return params;
}

// --- Event ID generation for deduplication between pixel and Events API ---

export function generateEventId(): string {
  return crypto.randomUUID();
}

// --- ttq.identify — matches TikTok's PII postback requirement ---

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value.trim().toLowerCase());
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Call after login/signup so TikTok can match conversions to ad clicks.
 * Must be called before any ttq.track() on pages where PII postback is expected.
 */
export async function identifyUser(email: string, userId: string) {
  if (typeof window === 'undefined' || !('ttq' in window)) return;
  const ttq = (
    window as unknown as {
      ttq: { identify: (params: Record<string, string>) => void };
    }
  ).ttq;

  const [hashedEmail, hashedId] = await Promise.all([
    sha256(email),
    sha256(userId),
  ]);

  ttq.identify({
    email: hashedEmail,
    external_id: hashedId,
  });
}

// --- Read TikTok cookies for forwarding to server ---

export function getTikTokClickId(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/ttclid=([^;]+)/);
  return match?.[1] || '';
}

export function getTikTokTtp(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/ttp=([^;]+)/);
  return match?.[1] || '';
}

// --- Server-side event forwarding ---

/**
 * Fire event to /api/tt-event for server-side TikTok Events API.
 * Fire-and-forget — never blocks the UI or throws.
 */
function sendServerEvent(eventName: string, props?: EventProperties): void {
  if (typeof window === 'undefined') return;

  const ttEvent = TT_EVENT_MAP[eventName];
  if (!ttEvent) return;

  // Dynamic import to avoid pulling client.ts into the module at parse time
  let token: string | null = null;
  try {
    token = localStorage.getItem('dance_auth_token');
  } catch { /* SSR guard */ }

  fetch('/api/tt-event', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      event: ttEvent,
      event_id: props?.eventId ? String(props.eventId) : undefined,
      template_id: props?.templateId ? String(props.templateId) : (props?.taskId ? String(props.taskId) : undefined),
      template_name: props?.templateName ? String(props.templateName) : undefined,
      value: props?.amount !== undefined ? Number(props.amount) : 0,
      currency: 'USD',
      ttclid: getTikTokClickId() || undefined,
      ttp: getTikTokTtp() || undefined,
    }),
  }).catch(() => {
    // Silently fail — server event is supplementary
  });
}

// --- Core tracking ---

export function trackEvent(eventName: string, properties?: EventProperties) {
  // Auto-generate event_id for TikTok-mapped events when not provided
  const eventId =
    properties?.eventId ||
    (TT_EVENT_MAP[eventName] ? generateEventId() : undefined);
  const props = eventId
    ? { ...properties, eventId }
    : properties;

  // Google Analytics — pass our internal property names as-is
  if (typeof window !== 'undefined' && 'gtag' in window) {
    (window as unknown as { gtag: (...args: unknown[]) => void }).gtag(
      'event',
      eventName,
      props
    );
  }

  // TikTok Pixel — translate to standard parameter structure
  if (typeof window !== 'undefined' && 'ttq' in window) {
    const ttq = (
      window as unknown as {
        ttq: { track: (name: string, params?: TikTokEventParams) => void };
      }
    ).ttq;
    const ttEvent = TT_EVENT_MAP[eventName];
    if (ttEvent) {
      ttq.track(ttEvent, toTikTokParams(props));
    }
  }

  // TikTok Events API (server-side) for events without dedicated server routes
  if (SERVER_SIDE_EVENTS.has(eventName)) {
    sendServerEvent(eventName, props);
  }
}

export function trackPageView(page: string) {
  trackEvent('page_view', { page });
}
