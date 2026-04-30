import { NextRequest, NextResponse } from 'next/server';
import {
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
  const variant = req.nextUrl.searchParams.get('variant') || 'preview';

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  try {
    const order = await getGuestOrder(orderId, token);
    if (!order.taskId) {
      return NextResponse.json({ error: 'Video is not ready yet' }, { status: 409 });
    }
    if (variant === 'original' && !order.unlocked) {
      return NextResponse.json({ error: 'Original video is locked' }, { status: 402 });
    }

    const task = await fetchToolTaskStatus(order.taskId, order.accessToken);
    if (normalizeTaskState(task?.status) !== 'completed') {
      return NextResponse.json({ error: 'Video is not ready yet' }, { status: 409 });
    }

    const { previewVideoUrl, originalVideoUrl } = resolveVideoUrls(task);
    const url = variant === 'original' ? originalVideoUrl : previewVideoUrl;
    if (!url) {
      return NextResponse.json({ error: 'Requested video is unavailable' }, { status: 404 });
    }

    const response = NextResponse.redirect(url);
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to open video';
    const status = error instanceof UpstreamApiError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
