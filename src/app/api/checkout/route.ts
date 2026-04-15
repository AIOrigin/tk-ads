import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserFromAuthHeader } from '@/lib/server/current-user';

export const runtime = 'nodejs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!.trim());

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const currentUser = await getCurrentUserFromAuthHeader(authHeader);

    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { templateId } = await req.json();

    const paymentIntent = await stripe.paymentIntents.create({
      amount: 299, // $2.99 in cents
      currency: 'usd',
      metadata: {
        templateId: typeof templateId === 'string' ? templateId : '',
        userId: currentUser.id,
        generationStatus: 'ready',
      },
    });

    return NextResponse.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.error('Checkout error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create payment';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
