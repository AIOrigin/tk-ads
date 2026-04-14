type EventProperties = Record<string, string | number | boolean>;

// TikTok standard event names matching the funnel configured in TikTok Ads Manager
const TT_EVENT_MAP: Record<string, string> = {
  view_content: 'ViewContent',
  sign_up: 'CompleteRegistration',
  payment_start: 'InitiateCheckout',
  payment_complete: 'Purchase',
  video_download: 'Download',
};

// TikTok expects a nested `contents` array — flat params are silently ignored.
// See: https://ads.tiktok.com/help/article/standard-events-parameters
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
  if (!props) return undefined;

  const params: TikTokEventParams = {};

  if (props.templateId) {
    const content: TikTokContent = {
      content_id: String(props.templateId),
      content_type: 'product',
    };
    if (props.templateName) content.content_name = String(props.templateName);
    params.contents = [content];
  }

  if (props.amount !== undefined) {
    params.value = Number(props.amount);
    params.currency = 'USD';
  }

  if (props.eventId) {
    params.event_id = String(props.eventId);
  }

  return Object.keys(params).length > 0 ? params : undefined;
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

// --- Core tracking ---

export function trackEvent(eventName: string, properties?: EventProperties) {
  // Google Analytics — pass our internal property names as-is
  if (typeof window !== 'undefined' && 'gtag' in window) {
    (window as unknown as { gtag: (...args: unknown[]) => void }).gtag(
      'event',
      eventName,
      properties
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
      ttq.track(ttEvent, toTikTokParams(properties));
    }
  }
}

export function trackPageView(page: string) {
  trackEvent('page_view', { page });
}
