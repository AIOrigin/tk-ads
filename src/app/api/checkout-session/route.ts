import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserFromAuthHeader } from '@/lib/server/current-user';

export const runtime = 'nodejs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!.trim());

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  const currentUser = await getCurrentUserFromAuthHeader(authHeader);

  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const paymentIntentId = req.nextUrl.searchParams.get('payment_intent_id');
  if (!paymentIntentId) {
    return NextResponse.json({ error: 'Missing payment_intent_id' }, { status: 400 });
  }

  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    const metadata = paymentIntent.metadata ?? {};

    if (metadata.userId !== currentUser.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      templateId: metadata.templateId || null,
      taskId: metadata.taskId || null,
      generationStatus: metadata.generationStatus || null,
      paid: paymentIntent.status === 'succeeded',
    });
  } catch (error) {
    console.error('Payment intent lookup error:', error);
    return NextResponse.json({ error: 'Failed to load payment info' }, { status: 500 });
  }
}
