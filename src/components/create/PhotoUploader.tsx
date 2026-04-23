'use client';

import { useEffect, useMemo, useRef } from 'react';
import { trackEvent } from '@/lib/analytics';
import { PHOTO_MAX_SIZE_MB } from '@/lib/constants';
import { toast } from '@/components/ui/Toast';

const MAX_DIMENSION = 1280;
const COMPRESS_QUALITY = 0.85;
const MAX_UPLOAD_BYTES = 3.5 * 1024 * 1024; // Keep under Vercel's 4.5MB limit
const PASSTHROUGH_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const FALLBACK_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'avif']);

function getFileExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

function isSupportedPhotoFile(file: File): boolean {
  const mimeType = file.type.toLowerCase();
  if (PASSTHROUGH_MIME_TYPES.has(mimeType)) return true;

  if (
    mimeType === 'image/jpg' ||
    mimeType === 'image/pjpeg' ||
    mimeType === 'image/heic' ||
    mimeType === 'image/heif' ||
    mimeType === 'image/heic-sequence' ||
    mimeType === 'image/heif-sequence' ||
    mimeType === 'image/avif' ||
    mimeType === 'image/avif-sequence'
  ) {
    return true;
  }

  if (!mimeType) {
    return FALLBACK_IMAGE_EXTENSIONS.has(getFileExtension(file.name));
  }

  return false;
}

function compressImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;
      const keepOriginalFile =
        PASSTHROUGH_MIME_TYPES.has(file.type.toLowerCase()) &&
        width <= MAX_DIMENSION &&
        height <= MAX_DIMENSION &&
        file.size <= MAX_UPLOAD_BYTES;

      if (keepOriginalFile) {
        resolve(file);
        return;
      }

      // Scale down
      if (width > height) {
        if (width > MAX_DIMENSION) { height = Math.round(height * MAX_DIMENSION / width); width = MAX_DIMENSION; }
      } else {
        if (height > MAX_DIMENSION) { width = Math.round(width * MAX_DIMENSION / height); height = MAX_DIMENSION; }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error('Compression failed')); return; }
          const outputName = /\.\w+$/.test(file.name) ? file.name.replace(/\.\w+$/, '.jpg') : `${file.name}.jpg`;
          resolve(new File([blob], outputName, { type: 'image/jpeg' }));
        },
        'image/jpeg',
        COMPRESS_QUALITY,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
    img.src = url;
  });
}

interface PhotoUploaderProps {
  onFileSelected: (file: File) => void;
  selectedFile?: File | null;
  hasSavedPhoto?: boolean;
}

export function PhotoUploader({
  onFileSelected,
  selectedFile = null,
  hasSavedPhoto = false,
}: PhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrl = useMemo(
    () => selectedFile ? URL.createObjectURL(selectedFile) : null,
    [selectedFile],
  );

  useEffect(() => {
    if (!previewUrl) return;

    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isSupportedPhotoFile(file)) {
      trackEvent('photo_upload_rejected', {
        mime: file.type || 'unknown',
        sizeBytes: file.size,
        reason: 'unsupported_type',
      });
      e.target.value = '';
      toast.error('Please upload a JPG, PNG, or WebP image');
      return;
    }

    if (file.size > PHOTO_MAX_SIZE_MB * 1024 * 1024) {
      trackEvent('photo_upload_rejected', {
        mime: file.type || 'unknown',
        sizeBytes: file.size,
        reason: 'too_large',
      });
      e.target.value = '';
      toast.error(`Photo must be under ${PHOTO_MAX_SIZE_MB}MB`);
      return;
    }

    try {
      const compressed = await compressImage(file);
      onFileSelected(compressed);
    } catch {
      trackEvent('photo_upload_rejected', {
        mime: file.type || 'unknown',
        sizeBytes: file.size,
        reason: 'failed_to_process',
      });
      e.target.value = '';
      toast.error('Failed to process image. Please try another photo.');
    }
  }

  function handleReupload() {
    if (inputRef.current) inputRef.current.value = '';
    inputRef.current?.click();
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleChange}
        className="hidden"
      />

      {!previewUrl && !hasSavedPhoto ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full aspect-[4/3] border border-dashed border-white/15 rounded-2xl flex flex-col items-center justify-center gap-2.5 text-white/30 hover:border-purple-500/40 hover:text-purple-400 transition-all duration-200"
        >
          <div className="w-12 h-12 rounded-full bg-white/[0.06] flex items-center justify-center">
            <svg aria-hidden="true" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </div>
          <span className="text-[13px] font-medium">Tap to upload photo</span>
          <span className="text-[11px] text-white/20">A clear selfie works best</span>
        </button>
      ) : previewUrl ? (
        <div className="relative aspect-[4/3] rounded-2xl overflow-hidden border border-white/10 bg-black/40">
          {/* Bottom layer: blurred fill */}
          <img
            src={previewUrl}
            alt="Blurred preview background"
            className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 brightness-50"
          />
          {/* Top layer: full photo fitted to height */}
          <img
            src={previewUrl}
            alt="Selected upload preview"
            className="absolute inset-0 w-full h-full object-contain drop-shadow-2xl"
          />
          <button
            type="button"
            onClick={handleReupload}
            className="absolute bottom-3 right-3 z-10 glass text-white text-[11px] font-medium px-3.5 py-1.5 rounded-full transition-transform active:scale-95"
          >
            Change Photo
          </button>
        </div>
      ) : (
        <div className="relative aspect-[4/3] rounded-2xl border border-white/15 bg-white/[0.04] flex flex-col items-center justify-center text-center px-6">
          <div className="w-12 h-12 rounded-full bg-emerald-500/15 flex items-center justify-center mb-3">
            <svg aria-hidden="true" className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <p className="text-[13px] font-medium text-white">Saved photo ready</p>
          <p className="text-[11px] text-white/30 mt-1">You can continue with your saved upload or change it.</p>
          <button
            type="button"
            onClick={handleReupload}
            className="absolute bottom-3 right-3 z-10 glass text-white text-[11px] font-medium px-3.5 py-1.5 rounded-full transition-transform active:scale-95"
          >
            Change Photo
          </button>
        </div>
      )}
    </div>
  );
}
