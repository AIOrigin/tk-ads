import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserFromAuthHeader } from '@/lib/server/current-user';

export const runtime = 'nodejs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!.trim());
const TOOL_API_BASE = process.env.TOOL_API_INTERNAL_URL || process.env.NEXT_PUBLIC_TOOL_API_BASE_URL!;

// In-memory set of used payment intents (for single-instance deployment)
const usedPayments = new Set<string>();

export async function POST(req: NextRequest) {
  let paymentIntentId: string | null = null;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const currentUser = await getCurrentUserFromAuthHeader(authHeader);
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    paymentIntentId = formData.get('payment_intent_id') as string;
    const motionVideoUrl = formData.get('motion_video_url') as string;
    const mode = formData.get('mode') as string;
    const characterOrientation = formData.get('character_orientation') as string;
    const durationSeconds = formData.get('duration_seconds') as string;
    const photoFile = formData.get('photo') as File;

    if (!paymentIntentId || !motionVideoUrl || !mode || !characterOrientation || !durationSeconds || !photoFile) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Prevent reuse
    if (usedPayments.has(paymentIntentId)) {
      return NextResponse.json(
        { error: 'This payment has already been used' },
        { status: 409 }
      );
    }

    // Verify Stripe payment
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    const metadata = paymentIntent.metadata ?? {};

    if (paymentIntent.status !== 'succeeded') {
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
      usedPayments.add(paymentIntentId);
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

    await stripe.paymentIntents.update(paymentIntentId, {
      metadata: {
        ...metadata,
        generationStatus: 'processing',
      },
    });

    // Forward to tool-api
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
      usedPayments.delete(paymentIntentId);
      await stripe.paymentIntents.update(paymentIntentId, {
        metadata: {
          ...metadata,
          generationStatus: 'ready',
        },
      });
      const errorText = await genResponse.text();
      console.error('Generation API error:', genResponse.status, errorText);
      return NextResponse.json(
        { error: 'Video generation failed. Please try again.' },
        { status: 502 }
      );
    }

    const result = await genResponse.json();
    usedPayments.add(paymentIntentId);
    await stripe.paymentIntents.update(paymentIntentId, {
      metadata: {
        ...metadata,
        generationStatus: result.status || 'processing',
        taskId: result.task_id,
      },
    });

    return NextResponse.json({
      success: true,
      task_id: result.task_id,
      status: result.status,
    });
  } catch (error) {
    if (paymentIntentId) {
      usedPayments.delete(paymentIntentId);
      try {
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
        const metadata = pi.metadata ?? {};
        await stripe.paymentIntents.update(paymentIntentId, {
          metadata: {
            ...metadata,
            generationStatus: metadata.taskId ? metadata.generationStatus || 'processing' : 'ready',
          },
        });
      } catch (stripeError) {
        console.error('Failed to reset payment intent metadata:', stripeError);
      }
    }

    console.error('Generate API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
