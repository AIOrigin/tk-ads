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

    const proto = req.headers.get('x-forwarded-proto') || 'https';
    const host = req.headers.get('host') || 'localhost:3000';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || `${proto}://${host}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      metadata: {
        templateId: typeof templateId === 'string' ? templateId : '',
        userId: currentUser.id,
        generationStatus: 'ready',
      },
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Dance Video Generation',
              description: 'Create your own AI dance video',
            },
            unit_amount: 299, // $2.99 in cents
          },
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/?canceled=true`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Checkout error:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
