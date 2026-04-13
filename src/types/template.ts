export interface Template {
  id: string;
  name: string;
  description: string;
  /** Dance motion video URL (preset from CDN) */
  motionVideoUrl: string;
  /** Thumbnail image (poster frame) */
  thumbnailUrl: string;
  /** Quality mode: 720p or 1080p */
  mode: '720p' | '1080p';
  /** Character orientation: video or image */
  characterOrientation: 'video' | 'image';
  /** Duration in seconds (10 for image, 15 for video) */
  durationSeconds: number;
  /** Credits cost for this configuration */
  creditCost: number;
  tags: string[];
}
