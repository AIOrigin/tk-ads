/**
 * Generic server-side TikTok Events API endpoint.
 *
 * Handles events that don't have a dedicated server route
 * (ViewContent, CompleteRegistration, Download).
 * Purchase and InitiateCheckout are fired inline from
 * /api/generate and /api/checkout respectively.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserFromAuthHeader } from '@/lib/server/current-user';
import { sendTikTokEvent, extractTikTokContext } from '@/lib/server/tiktok-events';

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
    const { event, event_id, template_id, template_name, value, currency, ttclid, ttp } = body;

    if (!event || !ALLOWED_EVENTS.has(event)) {
      return NextResponse.json({ error: 'Invalid event' }, { status: 400 });
    }

    // Auth is optional — ViewContent can happen before login
    const authHeader = req.headers.get('Authorization');
    const currentUser = await getCurrentUserFromAuthHeader(authHeader).catch(() => null);

    const ttCtx = extractTikTokContext(req);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';

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
      page_url: `${appUrl}/`,
      contents: template_id
        ? [{ content_id: template_id, content_type: 'product', content_name: template_name || '' }]
        : undefined,
      value: value !== undefined ? Number(value) : undefined,
      currency: currency || (value !== undefined ? 'USD' : undefined),
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
