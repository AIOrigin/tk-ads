import { toolApi } from './client';

// --- Motion Control Dance Generation ---

export interface MotionControlGenerateResult {
  success: boolean;
  task_id: string;
  status: string;
  generation_mode: string;
  message: string;
  code: string;
  error_code: string;
  source: string;
}

export interface DanceGenerateParams {
  /** Photo file to upload directly with the generation request */
  photoFile: File;
  /** Dance motion video URL (from presets) */
  motionVideoUrl: string;
  /** Quality mode */
  mode: '720p' | '1080p';
  /** Character orientation */
  characterOrientation: 'video' | 'image';
  /** Duration in seconds (10 for image, 15 for video orientation) */
  durationSeconds: number;
}

export async function generateDanceVideo(
  params: DanceGenerateParams
): Promise<MotionControlGenerateResult> {
  const formData = new FormData();

  formData.append('character_orientation', params.characterOrientation);
  formData.append('mode', params.mode);
  formData.append('duration_seconds', String(params.durationSeconds));

  // Photo — sent directly as file, backend handles S3 upload
  formData.append('input_files', params.photoFile);

  // Dance motion video
  formData.append('video_urls', JSON.stringify([params.motionVideoUrl]));

  return toolApi.post('v2/motion-control/generate', { body: formData }).json();
}

// --- Status Polling ---

export interface VideoOutput {
  id: string;
  status: string;
  progress: number;
  video_url: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  size_bytes: number | null;
  format: string | null;
}

export interface TaskStatus {
  task_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'deleted';
  progress: number;
  generation_mode: string;
  template_id: string | null;
  model_id: string;
  provider: string;
  prompt: string;
  videos: VideoOutput[];
  created_at: string;
  completed_at: string | null;
}

export interface BatchStatusResponse {
  total: number;
  found: number;
  results: TaskStatus[];
  notFound: string[];
}

export async function getTaskStatus(
  taskIds: string[]
): Promise<BatchStatusResponse> {
  return toolApi
    .post('v2/video/status/batch', { json: { task_ids: taskIds } })
    .json();
}
