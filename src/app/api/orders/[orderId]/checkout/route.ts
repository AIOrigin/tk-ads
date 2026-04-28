import { NextRequest, NextResponse } from 'next/server';
import { getBaseUrl } from '@/lib/server/base-url';
import { createUnlockCheckout, UpstreamApiError } from '@/lib/server/tk-ads-orders';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;

  try {
    const { token } = await req.json();
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    const appUrl = getBaseUrl(req);
    const successUrl = `${appUrl}/order/${encodeURIComponent(orderId)}?token=${encodeURIComponent(token)}&unlocked=1&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${appUrl}/order/${encodeURIComponent(orderId)}?token=${encodeURIComponent(token)}&canceled=1`;
    const checkout = await createUnlockCheckout({ orderId, token, successUrl, cancelUrl });
    return NextResponse.json({ url: checkout.redirectUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start checkout';
    const status = error instanceof UpstreamApiError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
