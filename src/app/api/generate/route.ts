import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserFromAuthHeader } from '@/lib/server/current-user';
import { sendTikTokEvent, extractTikTokContext } from '@/lib/server/tiktok-events';

export const runtime = 'nodejs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!.trim());
const TOOL_API_BASE = process.env.TOOL_API_INTERNAL_URL || process.env.NEXT_PUBLIC_TOOL_API_BASE_URL!;
const USER_API_BASE = process.env.USER_API_INTERNAL_URL || process.env.NEXT_PUBLIC_USER_API_BASE_URL!;
const USER_API_KEY = process.env.USER_API_INTERNAL_KEY || '';

// In-memory set of used session IDs (for single-instance deployment)
// For production with multiple instances, use Redis or a database
const usedSessions = new Set<string>();

// Calculate credits needed: matches tool-api formula
// base_credit = (17 if 720p else 26) * duration_seconds; final = ceil(base * 1.8)
function calculateCredits(mode: string, durationSeconds: number): number {
  const base = (mode === '720p' ? 17 : 26) * durationSeconds;
  return Math.ceil(base * 1.8);
}

// Grant credits to user via user-api before calling tool-api
async function grantCredits(userId: string, points: number): Promise<{ ok: boolean; error?: string }> {
  try {
    const url = `${USER_API_BASE}/v1/credits/grant`;
    console.log('[grantCredits] calling:', url, 'userId:', userId, 'points:', points, 'hasKey:', !!USER_API_KEY);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': USER_API_KEY,
      },
      body: JSON.stringify({
        userId,
        points,
        source: 'TKADS',
        type: 'TKADS',
        expiresInDays: 1,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('Grant credits failed:', res.status, text);
      return { ok: false, error: `Grant credits failed (${res.status}): ${text}` };
    }
    return { ok: true };
  } catch (err) {
    console.error('Grant credits error:', err);
    return { ok: false, error: `Grant credits error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function POST(req: NextRequest) {
  let sessionId: string | null = null;

  try {
    // Get user's JWT from Authorization header (forwarded from frontend)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const currentUser = await getCurrentUserFromAuthHeader(authHeader);
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    sessionId = formData.get('session_id') as string;
    const motionVideoUrl = formData.get('motion_video_url') as string;
    const mode = formData.get('mode') as string;
    const characterOrientation = formData.get('character_orientation') as string;
    const durationSeconds = formData.get('duration_seconds') as string;
    const photoFile = formData.get('photo') as File;
    const ttEventId = formData.get('tt_event_id') as string | null;
    const ttTemplateId = formData.get('tt_template_id') as string | null;
    const ttTemplateName = formData.get('tt_template_name') as string | null;
    const ttTtclid = formData.get('tt_ttclid') as string | null;
    const ttTtp = formData.get('tt_ttp') as string | null;

    // Validate required fields
    if (!sessionId || !motionVideoUrl || !mode || !characterOrientation || !durationSeconds || !photoFile) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Prevent session reuse — each payment = one generation
    if (usedSessions.has(sessionId)) {
      return NextResponse.json(
        { error: 'This payment has already been used' },
        { status: 409 }
      );
    }

    // Verify Stripe payment
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const metadata = session.metadata ?? {};

    if (session.payment_status !== 'paid') {
      return NextResponse.json(
        { error: 'Payment not completed' },
        { status: 402 }
      );
    }

    if (metadata.userId !== currentUser.id) {
      return NextResponse.json(
        { error: 'This payment does not belong to the current user' },
        { status: 403 }
      );
    }

    if (metadata.taskId) {
      usedSessions.add(sessionId);
      return NextResponse.json({
        success: true,
        task_id: metadata.taskId,
        status: metadata.generationStatus || 'processing',
        reused: true,
      });
    }

    if (metadata.generationStatus === 'processing') {
      return NextResponse.json(
        { error: 'Generation is already in progress for this payment' },
        { status: 409 }
      );
    }

    await stripe.checkout.sessions.update(sessionId, {
      metadata: {
        ...metadata,
        generationStatus: 'processing',
      },
    });

    // Grant credits to user before calling tool-api
    const creditsNeeded = calculateCredits(mode, parseInt(durationSeconds, 10));
    const grantResult = await grantCredits(currentUser.id, creditsNeeded);
    if (!grantResult.ok) {
      usedSessions.delete(sessionId);
      await stripe.checkout.sessions.update(sessionId, {
        metadata: { ...metadata, generationStatus: 'ready' },
      });
      return NextResponse.json(
        { error: grantResult.error || 'Failed to prepare credits for generation. Please try again.' },
        { status: 500 }
      );
    }

    // Forward to tool-api with user's JWT (tool-api validates JWT for user identity)
    const genForm = new FormData();
    genForm.append('character_orientation', characterOrientation);
    genForm.append('mode', mode);
    genForm.append('duration_seconds', durationSeconds);
    genForm.append('input_files', photoFile);
    genForm.append('video_urls', JSON.stringify([motionVideoUrl]));

    const genResponse = await fetch(`${TOOL_API_BASE}/v2/motion-control/generate`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
      },
      body: genForm,
    });

    if (!genResponse.ok) {
      // Unmark session so user can retry
      usedSessions.delete(sessionId);
      await stripe.checkout.sessions.update(sessionId, {
        metadata: {
          ...metadata,
          generationStatus: 'ready',
        },
      });
      let errorDetail = '';
      try {
        errorDetail = await genResponse.text();
      } catch { /* ignore */ }
      console.error('Generation API error:', genResponse.status, errorDetail);
      return NextResponse.json(
        { error: `Video generation failed (${genResponse.status}): ${errorDetail || 'Unknown error'}` },
        { status: 502 }
      );
    }

    const result = await genResponse.json();
    usedSessions.add(sessionId);
    await stripe.checkout.sessions.update(sessionId, {
      metadata: {
        ...metadata,
        generationStatus: result.status || 'processing',
        taskId: result.task_id,
      },
    });

    // TikTok Events API — Purchase (server-side, deduped with pixel via event_id)
    const ttCtx = extractTikTokContext(req);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
    sendTikTokEvent({
      event: 'Purchase',
      event_id: ttEventId || undefined,
      user: {
        email: currentUser.email,
        external_id: currentUser.id,
        ip: ttCtx.ip,
        user_agent: ttCtx.user_agent,
        ttclid: ttTtclid || ttCtx.ttclid,
        ttp: ttTtp || ttCtx.ttp,
      },
      page_url: `${appUrl}/`,
      contents: ttTemplateId
        ? [{ content_id: ttTemplateId, content_type: 'product', content_name: ttTemplateName || '' }]
        : undefined,
      value: 1.99,
      currency: 'USD',
    });

    return NextResponse.json({
      success: true,
      task_id: result.task_id,
      status: result.status,
    });
  } catch (error) {
    if (sessionId) {
      usedSessions.delete(sessionId);
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const metadata = session.metadata ?? {};
        await stripe.checkout.sessions.update(sessionId, {
          metadata: {
            ...metadata,
            generationStatus: metadata.taskId ? metadata.generationStatus || 'processing' : 'ready',
          },
        });
      } catch (stripeError) {
        console.error('Failed to reset checkout session metadata:', stripeError);
      }
    }

    console.error('Generate API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
