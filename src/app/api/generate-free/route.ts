import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserFromAuthHeader } from '@/lib/server/current-user';

export const runtime = 'nodejs';

const TOOL_API_BASE = process.env.TOOL_API_INTERNAL_URL || process.env.NEXT_PUBLIC_TOOL_API_BASE_URL!;

export async function POST(req: NextRequest) {
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
    const motionVideoUrl = formData.get('motion_video_url') as string;
    const mode = formData.get('mode') as string;
    const characterOrientation = formData.get('character_orientation') as string;
    const durationSeconds = formData.get('duration_seconds') as string;
    const photoFile = formData.get('photo') as File;

    if (!motionVideoUrl || !mode || !characterOrientation || !durationSeconds || !photoFile) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Call tool-api directly — it will check and deduct credits
    const genForm = new FormData();
    genForm.append('character_orientation', characterOrientation);
    genForm.append('mode', mode);
    genForm.append('duration_seconds', durationSeconds);
    genForm.append('input_files', photoFile);
    genForm.append('video_urls', JSON.stringify([motionVideoUrl]));

    const genResponse = await fetch(`${TOOL_API_BASE}/v2/motion-control/generate`, {
      method: 'POST',
      headers: { 'Authorization': authHeader },
      body: genForm,
    });

    if (!genResponse.ok) {
      let errorDetail = '';
      try { errorDetail = await genResponse.text(); } catch { /* ignore */ }
      console.error('Generation API error (credits):', genResponse.status, errorDetail);

      if (genResponse.status === 402) {
        return NextResponse.json(
          { error: 'Insufficient credits', code: 'INSUFFICIENT_CREDITS' },
          { status: 402 }
        );
      }

      return NextResponse.json(
        { error: `Video generation failed (${genResponse.status}): ${errorDetail || 'Unknown error'}` },
        { status: 502 }
      );
    }

    const result = await genResponse.json();

    return NextResponse.json({
      success: true,
      task_id: result.task_id,
      status: result.status,
    });
  } catch (error) {
    console.error('Generate (credits) API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
