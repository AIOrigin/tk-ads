import { NextRequest, NextResponse } from 'next/server';
import {
  completeGuestOrder,
  failGuestOrder,
  fetchToolTaskStatus,
  getGuestOrder,
  normalizeTaskState,
  resolveVideoUrls,
  UpstreamApiError,
} from '@/lib/server/tk-ads-orders';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const token = req.nextUrl.searchParams.get('token') || '';
  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  try {
    let order = await getGuestOrder(orderId, token);
    let task = null;
    let taskState = order.status;
    let progress = 0;
    let previewVideoUrl: string | null = null;
    let originalVideoUrl: string | null = null;

    if (order.taskId) {
      task = await fetchToolTaskStatus(order.taskId, order.accessToken);
      taskState = normalizeTaskState(task?.status);
      progress = task?.progress ?? 0;
      const urls = resolveVideoUrls(task);
      previewVideoUrl = urls.previewVideoUrl;
      originalVideoUrl = order.unlocked ? urls.originalVideoUrl : null;

      if (taskState === 'completed' && previewVideoUrl) {
        order = await completeGuestOrder(orderId, token);
      } else if (taskState === 'completed' && !previewVideoUrl && !order.unlocked) {
        taskState = 'processing';
      } else if (taskState === 'failed') {
        order = await failGuestOrder(orderId, token, 'Generation failed');
      }
    }

    return NextResponse.json({
      orderId: order.orderId,
      status: order.unlocked ? 'unlocked' : taskState || order.status,
      progress,
      taskId: order.taskId,
      templateId: order.templateId,
      templateName: order.templateName,
      email: order.email,
      unlocked: order.unlocked,
      previewEmailSentAt: order.previewEmailSentAt,
      unlockEmailSentAt: order.unlockEmailSentAt,
      previewVideoUrl,
      originalVideoUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load order';
    const status = error instanceof UpstreamApiError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
