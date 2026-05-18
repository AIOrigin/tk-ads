import { NextRequest, NextResponse } from 'next/server';
import { getBaseUrl } from '@/lib/server/base-url';
import {
  attachGuestOrderTask,
  calculateMotionControlCredits,
  createGuestOrder,
  failGuestOrder,
  UpstreamApiError,
} from '@/lib/server/tk-ads-orders';
import { sendTikTokEvent, extractTikTokContext } from '@/lib/server/tiktok-events';
import { sendMetaEvent, extractMetaContext } from '@/lib/server/meta-events';
import { resolveTaskErrorText } from '@/lib/task-errors';

export const runtime = 'nodejs';

const TOOL_API_BASE = process.env.TOOL_API_INTERNAL_URL || process.env.NEXT_PUBLIC_TOOL_API_BASE_URL!;

async function readToolError(response: Response): Promise<{
  errorCode: string | null;
  errorMessage: string;
}> {
  const text = await response.text().catch(() => '');
  return resolveTaskErrorText(text);
}

function firstForwardedIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    ''
  );
}

export async function POST(req: NextRequest) {
  let orderId: string | null = null;
  let orderToken: string | null = null;

  try {
    const formData = await req.formData();
    const email = String(formData.get('email') || '').trim();
    const motionVideoUrl = String(formData.get('motion_video_url') || '');
    const mode = String(formData.get('mode') || '');
    const characterOrientation = String(formData.get('character_orientation') || '');
    const durationSecondsRaw = String(formData.get('duration_seconds') || '');
    const photoFile = formData.get('photo') as File | null;
    const templateId = String(formData.get('template_id') || '');
    const templateName = String(formData.get('template_name') || '');
    const characterId = String(formData.get('character_id') || '');
    const inputMode = String(formData.get('input_mode') || 'preset');
    const adEventId = String(formData.get('ad_event_id') || formData.get('tt_event_id') || '');
    const ttTtclid = String(formData.get('tt_ttclid') || '');
    const ttTtp = String(formData.get('tt_ttp') || '');

    const durationSeconds = parseInt(durationSecondsRaw, 10);
    if (
      !email ||
      !motionVideoUrl ||
      !mode ||
      !characterOrientation ||
      !durationSeconds ||
      !photoFile ||
      !templateId
    ) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const creditsNeeded = calculateMotionControlCredits(mode, durationSeconds);
    const appUrl = getBaseUrl(req);
    const ttCtx = extractTikTokContext(req);
    const metaCtx = extractMetaContext(req);

    sendTikTokEvent({
      event: 'CompleteRegistration',
      event_id: adEventId || undefined,
      user: {
        email,
        ip: ttCtx.ip,
        user_agent: ttCtx.user_agent,
        ttclid: ttTtclid || ttCtx.ttclid,
        ttp: ttTtp || ttCtx.ttp,
      },
      page_url: `${appUrl}/`,
      contents: [{ content_id: templateId, content_type: 'product', content_name: templateName }],
      value: 0,
      currency: 'USD',
    });

    sendMetaEvent({
      event: 'CompleteRegistration',
      event_id: adEventId || undefined,
      user: {
        email,
        ip: metaCtx.ip,
        user_agent: metaCtx.user_agent,
        fbp: metaCtx.fbp,
        fbc: metaCtx.fbc,
      },
      page_url: `${appUrl}/`,
      content_id: templateId,
      content_name: templateName,
      content_type: 'product',
      value: 0,
      currency: 'USD',
    });

    const guestOrder = await createGuestOrder({
      email,
      templateId,
      templateName,
      characterId,
      inputMode,
      creditsNeeded,
      appUrl,
      ip: firstForwardedIp(req),
      userAgent: req.headers.get('user-agent') || '',
    });
    orderId = guestOrder.orderId;
    orderToken = guestOrder.token;

    const genForm = new FormData();
    genForm.append('character_orientation', characterOrientation);
    genForm.append('mode', mode);
    genForm.append('duration_seconds', String(durationSeconds));
    genForm.append('input_files', photoFile);
    genForm.append('video_urls', JSON.stringify([motionVideoUrl]));

    const genResponse = await fetch(`${TOOL_API_BASE}/v2/motion-control/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${guestOrder.accessToken}`,
      },
      body: genForm,
    });

    if (!genResponse.ok) {
      const failure = await readToolError(genResponse);
      await failGuestOrder(orderId, orderToken, failure.errorMessage);
      return NextResponse.json(
        { error: failure.errorMessage, code: failure.errorCode },
        { status: failure.errorCode === 'TASK_CONCURRENCY_LIMIT' ? 409 : genResponse.status === 402 ? 402 : 502 }
      );
    }

    const result = await genResponse.json();
    const taskId = result.task_id || result.taskId;
    if (!taskId) {
      await failGuestOrder(orderId, orderToken, 'Generation response did not include a task id.');
      return NextResponse.json({ error: 'Video generation did not return a task id' }, { status: 502 });
    }

    await attachGuestOrderTask(orderId, orderToken, taskId);

    return NextResponse.json({
      orderId,
      token: orderToken,
      taskId,
      status: result.status,
    });
  } catch (error) {
    if (orderId && orderToken) {
      await failGuestOrder(orderId, orderToken, error instanceof Error ? error.message : 'Internal server error')
        .catch(() => {});
    }
    const message = error instanceof Error ? error.message : 'Failed to start preview';
    const status = error instanceof UpstreamApiError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
