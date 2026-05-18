/**
 * Meta Conversions API — server-side event tracking.
 *
 * Sends the same event_id as Meta Pixel browser events so Meta can
 * deduplicate browser + server copies of the same conversion.
 */

import { createHash } from 'crypto';

const GRAPH_API_VERSION = 'v25.0';
const PIXEL_ID = process.env.META_PIXEL_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID || '';
const ACCESS_TOKEN = process.env.META_CAPI_ACCESS_TOKEN || '';
const TEST_EVENT_CODE = process.env.META_CAPI_TEST_EVENT_CODE || '';

function sha256(value: string): string {
  return createHash('sha256')
    .update(value.trim().toLowerCase())
    .digest('hex');
}

interface MetaEventUser {
  email?: string;
  external_id?: string;
  ip?: string;
  user_agent?: string;
  fbp?: string;
  fbc?: string;
}

interface SendMetaEventOptions {
  event: string;
  event_id?: string;
  user: MetaEventUser;
  page_url: string;
  content_id?: string;
  content_name?: string;
  content_type?: string;
  value?: number;
  currency?: string;
}

function readCookie(cookieHeader: string, name: string): string {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${escapedName}=([^;]+)`));
  if (!match?.[1]) return '';

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/**
 * Extract Meta matching context from a NextRequest.
 * _fbp and _fbc are first-party cookies set by Meta Pixel.
 */
export function extractMetaContext(req: Request) {
  const cookieHeader = req.headers.get('cookie') || '';
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '';

  return {
    ip,
    user_agent: req.headers.get('user-agent') || '',
    fbp: readCookie(cookieHeader, '_fbp'),
    fbc: readCookie(cookieHeader, '_fbc'),
  };
}

/**
 * Fire a single event to Meta Conversions API.
 * Non-blocking — logs errors but never throws.
 */
export function sendMetaEvent(opts: SendMetaEventOptions): void {
  if (!PIXEL_ID || !ACCESS_TOKEN) return;

  const userData = {
    ...(opts.user.email ? { em: [sha256(opts.user.email)] } : {}),
    ...(opts.user.external_id ? { external_id: [sha256(opts.user.external_id)] } : {}),
    ...(opts.user.ip ? { client_ip_address: opts.user.ip } : {}),
    ...(opts.user.user_agent ? { client_user_agent: opts.user.user_agent } : {}),
    ...(opts.user.fbp ? { fbp: opts.user.fbp } : {}),
    ...(opts.user.fbc ? { fbc: opts.user.fbc } : {}),
  };

  const customData = {
    ...(opts.content_id ? { content_ids: [opts.content_id], content_type: opts.content_type || 'product' } : {}),
    ...(opts.content_name ? { content_name: opts.content_name } : {}),
    ...(opts.value !== undefined ? { value: opts.value } : {}),
    ...(opts.currency ? { currency: opts.currency } : {}),
  };

  const payload = {
    data: [
      {
        event_name: opts.event,
        event_time: Math.floor(Date.now() / 1000),
        ...(opts.event_id ? { event_id: opts.event_id } : {}),
        action_source: 'website',
        event_source_url: opts.page_url,
        user_data: userData,
        ...(Object.keys(customData).length > 0 ? { custom_data: customData } : {}),
      },
    ],
    ...(TEST_EVENT_CODE ? { test_event_code: TEST_EVENT_CODE } : {}),
  };

  fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
    .then(async (res) => {
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error(`[Meta CAPI] ${opts.event} failed: ${res.status} ${body}`);
      }
    })
    .catch((err) => {
      console.error(`[Meta CAPI] ${opts.event} network error:`, err);
    });
}
