import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserFromAuthHeader } from '@/lib/server/current-user';

export const runtime = 'nodejs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!.trim());
const TOOL_API_BASE = process.env.TOOL_API_INTERNAL_URL || process.env.NEXT_PUBLIC_TOOL_API_BASE_URL!;

// In-memory set of used session IDs (for single-instance deployment)
// For production with multiple instances, use Redis or a database
const usedSessions = new Set<string>();

export async function POST(req: NextRequest) {
  let sessionId: string | null = null;

  try {
    // Get user's JWT from Authorization header (forwarded from frontend)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const currentUser = await getCurrentUserFromAuthHeader(authHeader);
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    sessionId = formData.get('session_id') as string;
    const motionVideoUrl = formData.get('motion_video_url') as string;
    const mode = formData.get('mode') as string;
    const characterOrientation = formData.get('character_orientation') as string;
    const durationSeconds = formData.get('duration_seconds') as string;
    const photoFile = formData.get('photo') as File;

    // Validate required fields
    if (!sessionId || !motionVideoUrl || !mode || !characterOrientation || !durationSeconds || !photoFile) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Prevent session reuse — each payment = one generation
    if (usedSessions.has(sessionId)) {
      return NextResponse.json(
        { error: 'This payment has already been used' },
        { status: 409 }
      );
    }

    // Verify Stripe payment
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const metadata = session.metadata ?? {};

    if (session.payment_status !== 'paid') {
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
      usedSessions.add(sessionId);
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

    await stripe.checkout.sessions.update(sessionId, {
      metadata: {
        ...metadata,
        generationStatus: 'processing',
      },
    });

    // Forward to tool-api with user's JWT (tool-api validates JWT for user identity)
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
      // Unmark session so user can retry
      usedSessions.delete(sessionId);
      await stripe.checkout.sessions.update(sessionId, {
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
    usedSessions.add(sessionId);
    await stripe.checkout.sessions.update(sessionId, {
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
    if (sessionId) {
      usedSessions.delete(sessionId);
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const metadata = session.metadata ?? {};
        await stripe.checkout.sessions.update(sessionId, {
          metadata: {
            ...metadata,
            generationStatus: metadata.taskId ? metadata.generationStatus || 'processing' : 'ready',
          },
        });
      } catch (stripeError) {
        console.error('Failed to reset checkout session metadata:', stripeError);
      }
    }

    console.error('Generate API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
