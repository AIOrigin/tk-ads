import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { getBaseUrl } from '@/lib/server/base-url';
import { getCurrentUserFromAuthHeader } from '@/lib/server/current-user';
import { sendTikTokEvent, extractTikTokContext } from '@/lib/server/tiktok-events';

export const runtime = 'nodejs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!.trim());

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const currentUser = await getCurrentUserFromAuthHeader(authHeader);

    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { templateId, templateName, characterId, inputMode, ttEventId, ttTtclid, ttTtp } = await req.json();

    const appUrl = getBaseUrl(req);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      metadata: {
        templateId: typeof templateId === 'string' ? templateId : '',
        characterId: typeof characterId === 'string' ? characterId : '',
        inputMode: typeof inputMode === 'string' ? inputMode : 'preset',
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
            unit_amount: 199, // $1.99 in cents
          },
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/?canceled=true`,
    });

    // TikTok Events API — InitiateCheckout (server-side, deduped with pixel via event_id)
    const ttCtx = extractTikTokContext(req);
    sendTikTokEvent({
      event: 'InitiateCheckout',
      event_id: ttEventId,
      user: {
        email: currentUser.email,
        external_id: currentUser.id,
        ip: ttCtx.ip,
        user_agent: ttCtx.user_agent,
        ttclid: ttTtclid || ttCtx.ttclid,
        ttp: ttTtp || ttCtx.ttp,
      },
      page_url: `${appUrl}/`,
      contents: templateId
        ? [{ content_id: templateId, content_type: 'product', content_name: templateName || '' }]
        : undefined,
      value: 1.99,
      currency: 'USD',
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Checkout error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create checkout session';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
