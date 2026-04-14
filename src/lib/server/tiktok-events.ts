/**
 * TikTok Events API v1.3 — server-side event tracking.
 *
 * Sends the same events as the client pixel (with matching event_id)
 * so TikTok deduplicates and gets reliable attribution even when
 * ad blockers prevent the pixel from firing.
 *
 * Docs: https://business-api.tiktok.com/portal/docs?id=1771100865818625
 */

import { createHash } from 'crypto';

const EVENTS_API_URL =
  'https://business-api.tiktok.com/open_api/v1.3/event/track/';
const ACCESS_TOKEN = process.env.TIKTOK_ACCESS_TOKEN || '';
const PIXEL_CODE = 'D7EBTLBC77U751P3I9NG';

// SHA-256 helper (server-side, uses Node crypto)
function sha256(value: string): string {
  return createHash('sha256')
    .update(value.trim().toLowerCase())
    .digest('hex');
}

interface EventContent {
  content_id: string;
  content_type?: string;
  content_name?: string;
}

interface EventUser {
  email?: string;
  external_id?: string;
  ip?: string;
  user_agent?: string;
  ttclid?: string;
  ttp?: string;
}

interface SendEventOptions {
  event: string;
  event_id?: string;
  user: EventUser;
  page_url: string;
  page_referrer?: string;
  contents?: EventContent[];
  value?: number;
  currency?: string;
}

/**
 * Fire a single event to TikTok Events API.
 * Non-blocking — logs errors but never throws.
 */
export function sendTikTokEvent(opts: SendEventOptions): void {
  if (!ACCESS_TOKEN) return;

  const payload = {
    event_source: 'web',
    event_source_id: PIXEL_CODE,
    data: [
      {
        event: opts.event,
        event_id: opts.event_id,
        event_time: Math.floor(Date.now() / 1000),
        user: {
          ...(opts.user.email ? { email: sha256(opts.user.email) } : {}),
          ...(opts.user.external_id
            ? { external_id: sha256(opts.user.external_id) }
            : {}),
          ...(opts.user.ip ? { ip: opts.user.ip } : {}),
          ...(opts.user.user_agent
            ? { user_agent: opts.user.user_agent }
            : {}),
          ...(opts.user.ttclid ? { ttclid: opts.user.ttclid } : {}),
          ...(opts.user.ttp ? { ttp: opts.user.ttp } : {}),
        },
        page: {
          url: opts.page_url,
          ...(opts.page_referrer ? { referrer: opts.page_referrer } : {}),
        },
        properties: {
          ...(opts.contents ? { contents: opts.contents } : {}),
          ...(opts.value !== undefined ? { value: opts.value } : {}),
          ...(opts.currency ? { currency: opts.currency } : {}),
        },
      },
    ],
  };

  // Fire and forget — don't block the response
  fetch(EVENTS_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Access-Token': ACCESS_TOKEN,
    },
    body: JSON.stringify(payload),
  })
    .then(async (res) => {
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error(
          `[TikTok Events API] ${opts.event} failed: ${res.status} ${body}`
        );
      }
    })
    .catch((err) => {
      console.error(`[TikTok Events API] ${opts.event} network error:`, err);
    });
}

/**
 * Extract TikTok tracking context from a NextRequest.
 * Reads IP, User-Agent, ttclid, and ttp from headers/cookies.
 */
export function extractTikTokContext(req: Request) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '';
  const userAgent = req.headers.get('user-agent') || '';

  // ttclid can come from cookie or be forwarded as a header/form field by client
  const cookieHeader = req.headers.get('cookie') || '';
  const ttclidMatch = cookieHeader.match(/ttclid=([^;]+)/);
  const ttpMatch = cookieHeader.match(/ttp=([^;]+)/);

  return {
    ip,
    user_agent: userAgent,
    ttclid: ttclidMatch?.[1] || '',
    ttp: ttpMatch?.[1] || '',
  };
}
