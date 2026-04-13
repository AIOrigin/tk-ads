import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserFromAuthHeader } from '@/lib/server/current-user';

export const runtime = 'nodejs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  const currentUser = await getCurrentUserFromAuthHeader(authHeader);

  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sessionId = req.nextUrl.searchParams.get('session_id');
  if (!sessionId) {
    return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const metadata = session.metadata ?? {};

    if (metadata.userId !== currentUser.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({
      sessionId: session.id,
      paymentStatus: session.payment_status,
      templateId: metadata.templateId || null,
      taskId: metadata.taskId || null,
      generationStatus: metadata.generationStatus || null,
      paid: session.payment_status === 'paid',
    });
  } catch (error) {
    console.error('Checkout session lookup error:', error);
    return NextResponse.json({ error: 'Failed to load checkout session' }, { status: 500 });
  }
}
