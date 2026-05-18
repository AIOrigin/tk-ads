/**
 * Generic server-side ad events endpoint.
 *
 * Handles events that don't have a dedicated server route
 * (ViewContent, Download). Early generation conversion is normally
 * fired inline from /api/preview and /api/generate. Purchase and InitiateCheckout are fired inline
 * from /api/generate and /api/checkout respectively.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getBaseUrl } from '@/lib/server/base-url';
import { getCurrentUserFromAuthHeader } from '@/lib/server/current-user';
import { sendTikTokEvent, extractTikTokContext } from '@/lib/server/tiktok-events';
import { sendMetaEvent, extractMetaContext } from '@/lib/server/meta-events';

export const runtime = 'nodejs';

// Only allow events that aren't already fired from dedicated routes
const ALLOWED_EVENTS = new Set([
  'ViewContent',
  'CompleteRegistration',
  'Download',
]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      event,
      event_id,
      template_id,
      template_name,
      value,
      currency,
      ttclid,
      ttp,
      page_url,
    } = body;

    if (!event || !ALLOWED_EVENTS.has(event)) {
      return NextResponse.json({ error: 'Invalid event' }, { status: 400 });
    }

    // Auth is optional — ViewContent can happen before login
    const authHeader = req.headers.get('Authorization');
    const currentUser = await getCurrentUserFromAuthHeader(authHeader).catch(() => null);

    const ttCtx = extractTikTokContext(req);
    const metaCtx = extractMetaContext(req);
    const appUrl = getBaseUrl(req);
    const pageUrl = typeof page_url === 'string' && page_url ? page_url : `${appUrl}/`;
    const metaEvent = event === 'CompleteRegistration' ? 'Lead' : event;

    await Promise.allSettled([
      sendTikTokEvent({
        event,
        event_id: event_id || undefined,
        user: {
          ...(currentUser?.email ? { email: currentUser.email } : {}),
          ...(currentUser?.id ? { external_id: currentUser.id } : {}),
          ip: ttCtx.ip,
          user_agent: ttCtx.user_agent,
          ttclid: ttclid || ttCtx.ttclid,
          ttp: ttp || ttCtx.ttp,
        },
        page_url: pageUrl,
        contents: template_id
          ? [{ content_id: template_id, content_type: 'product', content_name: template_name || '' }]
          : undefined,
        value: value !== undefined ? Number(value) : 0,
        currency: currency || 'USD',
      }),
      sendMetaEvent({
        event: metaEvent,
        event_id: event_id || undefined,
        user: {
          ...(currentUser?.email ? { email: currentUser.email } : {}),
          ...(currentUser?.id ? { external_id: currentUser.id } : {}),
          ip: metaCtx.ip,
          user_agent: metaCtx.user_agent,
          fbp: metaCtx.fbp,
          fbc: metaCtx.fbc,
        },
        page_url: pageUrl,
        content_id: template_id || undefined,
        content_name: template_name || undefined,
        content_type: template_id ? 'product' : undefined,
        value: value !== undefined ? Number(value) : 0,
        currency: currency || 'USD',
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
